import { node } from '@/lib/node';
import { ConfigYamlSchema, WorkspaceYamlSchema, type ConfigYaml, type LintWarning } from '@/schemas';
import type { Case, Run, TreeNode, Workspace } from '@/types';
import { folderSlug, slug } from '@/utils/ids';
import { parseCase } from './format/case';
import { CASEWRIGHT_GITIGNORE, serializeConfigYaml } from './format/config';
import { parseFolderNote, serializeFolderNote, type FolderNoteMeta } from './format/folder-note';
import { parseRunCase, parseRunDetails, type RunCaseItem } from './format/run';
import { parseSuite } from './format/suite';

// ---------------------------------------------------------------------------
// `.casewright/` layout. The repo is identified by `.casewright/`; `config.yaml`
// lists the workspace folders; each workspace/suite folder may have an optional
// sibling "folder note" (`<folder>.md`) for its name/prefix/description; runs are
// centralized in `.casewright/runs/`.
// ---------------------------------------------------------------------------

const CASEWRIGHT_DIR = '.casewright';
const CONFIG_REL = '.casewright/config.yaml';
const RUNS_REL = '.casewright/runs';
const WORKSPACE_MARKER = 'casewright.yaml'; // legacy workspace marker — read only (migration + fallback)
const LEGACY_SUITE_FILE = '_suite.md'; // legacy suite metadata — read only (migration + fallback)

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

async function readMaybe(file: string): Promise<string | null> {
  try {
    return await node.fsp().readFile(file, 'utf8');
  } catch {
    return null;
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await node.fsp().stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Join repo-relative path segments, treating the repo root (`'.'` or `''`) as empty
 * so we never emit a `./foo` prefix or a leading slash. Returns `''` for the root
 * itself — which is also how the store represents "no parent dir" (see `casePath`).
 */
export function relJoin(...parts: string[]): string {
  return parts.flatMap((p) => (p === '.' || p === '' ? [] : p.split('/'))).join('/');
}

/**
 * Convert an absolute path to a repo-relative, forward-slash path (the form workspaces
 * use). Returns `''` for the repo root itself, or `null` if `abs` lies outside the repo.
 */
export function toRepoRelative(repoPath: string, abs: string): string | null {
  const path = node.path();
  const rel = path.relative(repoPath, abs);
  if (rel === '') return ''; // the repo root itself
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/** Parse a standalone YAML document (e.g. `casewright.yaml`) by wrapping it as front matter. */
function parseYamlDoc(raw: string): Record<string, unknown> {
  const wrapped = `---\n${raw.replace(/\r\n/g, '\n').trim()}\n---\n`;
  return (node.matter()(wrapped).data ?? {}) as Record<string, unknown>;
}

/** Derive a placeholder display-ID prefix from a workspace name (PRD §4 req 13). */
export function derivePrefix(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('');
  const cleaned = (initials || name).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleaned.slice(0, 4) || 'CW';
}

// ---------------------------------------------------------------------------
// Folder notes — optional sibling `<folder>.md` carrying a workspace/suite's
// name/prefix/description. Lazy: written only when it has metadata to store.
// ---------------------------------------------------------------------------

/** Last path segment (folder basename) of a repo-relative path. */
function baseOf(rel: string): string {
  return rel.split('/').pop() ?? rel;
}

/** Parent directory of a repo-relative path (`''` for a top-level entry). */
function parentOf(rel: string): string {
  return rel.split('/').slice(0, -1).join('/');
}

/**
 * Repo-relative path of the sibling folder note for a folder. Uses the **literal**
 * (already wiki-safe) folder basename — never the id `slug()`. The repo root (`''`) has
 * no parent dir for a sibling note, so its metadata lives in `config.yaml` instead.
 */
export function folderNoteRel(folderRel: string): string {
  if (folderRel === '' || folderRel === '.') return CONFIG_REL;
  return relJoin(parentOf(folderRel), `${baseOf(folderRel)}.md`);
}

/**
 * Whether a folder note carries anything worth persisting: a custom display name (one
 * that differs from the folder basename), a display-ID prefix, or a description. When
 * none hold, the folder is left note-less (its name is used as the display name).
 */
export function noteNeeded(basename: string, meta: { name?: string; prefix?: string; description?: string }): boolean {
  const name = (meta.name ?? '').trim();
  return (!!name && name !== basename) || !!(meta.prefix ?? '').trim() || !!(meta.description ?? '').trim();
}

/**
 * Whether an existing folder basename must be normalized for an Azure DevOps wiki: it
 * contains whitespace or a filesystem/wiki-illegal character. A bare `-` is a valid encoded
 * separator, so we deliberately do NOT flag plain kebab-case folders (avoids churning a repo
 * full of `user-management/`-style names); only the names we *generate* encode `-` as `%2D`.
 * When a flagged folder is renamed, `folderSlug` still encodes any literal `-` it contains.
 */
function needsWikiFix(base: string): boolean {
  return /[\s/\\:*?"<>|]/.test(base);
}

/** Loaded folder metadata (from a folder note, with legacy fallbacks). */
interface FolderMeta {
  name?: string;
  prefix?: string;
  description: string;
}

/**
 * Read a folder's metadata: the sibling folder note first, then legacy fallbacks
 * (`casewright.yaml` for a workspace, `_suite.md` for a suite). Returns `null` when the
 * folder has no note/marker — a perfectly normal, supported state (the caller defaults
 * the display name to the folder basename).
 */
async function readFolderMeta(repoPath: string, folderRel: string, warnings: LintWarning[]): Promise<FolderMeta | null> {
  const path = node.path();

  // 1. New format: the sibling folder note.
  if (folderRel !== '' && folderRel !== '.') {
    const noteRel = folderNoteRel(folderRel);
    const noteRaw = await readMaybe(path.join(repoPath, noteRel));
    if (noteRaw != null) {
      const { meta, description, warnings: w } = parseFolderNote(noteRaw);
      for (const x of w) warnings.push({ ...x, file: noteRel });
      return { name: meta.name, prefix: meta.displayIdPrefix, description };
    }
  }

  // 2. Legacy: a `casewright.yaml` workspace marker inside the folder.
  const legacyWsRel = relJoin(folderRel, WORKSPACE_MARKER);
  const legacyWsRaw = await readMaybe(path.join(repoPath, legacyWsRel));
  if (legacyWsRaw != null) {
    const parsed = WorkspaceYamlSchema.safeParse(parseYamlDoc(legacyWsRaw));
    const y = parsed.success ? parsed.data : WorkspaceYamlSchema.parse({});
    warnings.push({ code: 'legacy-format', message: `Legacy casewright.yaml at "${folderRel || '.'}" — reopen to migrate it to a folder note.`, file: legacyWsRel });
    return { name: y.name, prefix: y.displayIdPrefix, description: y.description ?? '' };
  }

  // 3. Legacy: a `_suite.md` inside the folder.
  const legacySuiteRaw = await readMaybe(path.join(repoPath, relJoin(folderRel, LEGACY_SUITE_FILE)));
  if (legacySuiteRaw != null) {
    const { suite } = parseSuite(legacySuiteRaw);
    return { name: suite.title, prefix: undefined, description: suite.description ?? '' };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Open repo → validate `.casewright/` + discover workspaces
// ---------------------------------------------------------------------------

export interface OpenedRepo {
  repoPath: string;
  workspaces: Workspace[];
  branch: string;
  warnings: LintWarning[];
  /** True when the worktree is a Git repo but has no `.casewright/` yet (offer to init). */
  needsInit: boolean;
}

/**
 * The workspace folders, read from `.casewright/config.yaml`'s `workspaces:` list — the
 * single source of truth (no more tree-walking for markers). Normalizes `.`→`''` (root),
 * strips `./` and trailing slashes, and de-dupes while preserving declaration order.
 */
function discoverWorkspaces(configData: Record<string, unknown>): string[] {
  const parsed = ConfigYamlSchema.safeParse(configData);
  const list = parsed.success ? parsed.data.workspaces : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const norm = raw === '.' ? '' : raw.replace(/^\.\//, '').replace(/\/+$/, '');
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

async function loadWorkspaceMeta(repoPath: string, wsPath: string, warnings: LintWarning[]): Promise<Workspace> {
  const path = node.path();
  const baseName = wsPath === '' ? path.basename(repoPath) : path.basename(wsPath);

  let meta: FolderMeta | null;
  if (wsPath === '') {
    // Root workspace: metadata lives in config.yaml (no parent dir for a sibling note).
    const cfgRaw = await readMaybe(path.join(repoPath, CONFIG_REL));
    const parsed = ConfigYamlSchema.safeParse(cfgRaw ? parseYamlDoc(cfgRaw) : {});
    const cfg = parsed.success ? parsed.data : ConfigYamlSchema.parse({});
    meta = { name: cfg.name, prefix: cfg.displayIdPrefix, description: cfg.description ?? '' };
  } else {
    meta = await readFolderMeta(repoPath, wsPath, warnings);
  }

  // A note-less folder is fine: fall back to the folder name and a derived prefix, silently.
  const name = (meta?.name ?? '').trim() || baseName;
  const prefix = (meta?.prefix ?? '').trim() || derivePrefix(name);

  return {
    id: slug(wsPath) || slug(baseName) || 'workspace',
    name,
    path: wsPath,
    description: meta?.description ?? '',
    prefix,
  };
}

/**
 * Open a repository: validate the Git worktree **and** the `.casewright/` folder,
 * read `.casewright/config.yaml` tolerantly, and discover self-declaring workspaces
 * (PRD §4 req 1–14). A missing `.casewright/` is reported via `needsInit` (not thrown).
 */
export async function openRepo(repoPath: string): Promise<OpenedRepo> {
  const path = node.path();
  const warnings: LintWarning[] = [];

  const git = node.simpleGit()(repoPath);
  if (!(await git.checkIsRepo())) {
    throw new Error(`Not a Git repository: ${repoPath}`);
  }
  const branch = (await git.branchLocal()).current || 'main';

  if (!(await isDir(path.join(repoPath, CASEWRIGHT_DIR)))) {
    warnings.push({ code: 'needs-init', message: 'This repository has no .casewright/ folder yet.' });
    return { repoPath, workspaces: [], branch, warnings, needsInit: true };
  }

  // Auto-migrate a legacy repo (casewright.yaml/_suite.md → config + folder notes) and
  // normalize folder names to be wiki-safe BEFORE discovery reads the config. Idempotent.
  await migrateRepo(repoPath, warnings);

  const configRaw = await readMaybe(path.join(repoPath, CONFIG_REL));
  const configData = configRaw ? parseYamlDoc(configRaw) : {};
  if (configRaw && !ConfigYamlSchema.safeParse(configData).success) {
    warnings.push({ code: 'config', message: '.casewright/config.yaml was invalid; using defaults.', file: CONFIG_REL });
  }

  const relPaths = discoverWorkspaces(configData);
  const workspaces: Workspace[] = [];
  for (const rel of relPaths) {
    if (rel !== '' && !(await isDir(path.join(repoPath, rel)))) {
      warnings.push({ code: 'ws-missing', message: `Workspace folder "${rel}" is listed in config but does not exist.`, file: CONFIG_REL });
      continue;
    }
    workspaces.push(await loadWorkspaceMeta(repoPath, rel, warnings));
  }
  workspaces.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));

  if (!workspaces.length) {
    warnings.push({ code: 'empty-repo', message: 'No workspaces found — add one to .casewright/config.yaml.' });
  }

  return { repoPath, workspaces, branch, warnings, needsInit: false };
}

/**
 * Scaffold `.casewright/` for a Git repo that doesn't have it yet (PRD §4 req 2, 4):
 * writes `config.yaml`, creates `runs/` (tracked via `.gitkeep`), and writes the
 * `.gitignore` that keeps `cache/` out of Git.
 */
export async function initRepo(repoPath: string): Promise<void> {
  const path = node.path();
  const fsp = node.fsp();
  const dir = path.join(repoPath, CASEWRIGHT_DIR);
  await fsp.mkdir(path.join(dir, 'runs'), { recursive: true });
  await fsp.writeFile(path.join(dir, 'config.yaml'), serializeConfigYaml({ version: 1, name: path.basename(repoPath) }));
  await fsp.writeFile(path.join(dir, '.gitignore'), CASEWRIGHT_GITIGNORE);
  await fsp.writeFile(path.join(dir, 'runs', '.gitkeep'), '');
}

// ---------------------------------------------------------------------------
// Load workspaces → tree + cases; load runs → repo-level
// ---------------------------------------------------------------------------

export interface LoadedWorkspace {
  tree: TreeNode[];
  cases: Case[];
  warnings: LintWarning[];
}

export interface LoadedRepo {
  tree: TreeNode[];
  cases: Case[];
  runs: Run[];
  warnings: LintWarning[];
}

/**
 * Read a suite folder's metadata from its sibling note (`<parentDir>/<name>.md`), using
 * the already-listed parent `entries` to avoid a read when no note exists; falls back to a
 * legacy `_suite.md` inside the folder. Returns `null` for the (normal) note-less folder.
 */
async function readSuiteMeta(
  parentAbs: string,
  parentEntries: { name: string; isFile: () => boolean }[],
  name: string,
): Promise<FolderMeta | null> {
  const path = node.path();
  const noteName = `${name}.md`;
  if (parentEntries.some((e) => e.isFile() && e.name === noteName)) {
    const raw = await readMaybe(path.join(parentAbs, noteName));
    if (raw != null) {
      const { meta, description } = parseFolderNote(raw);
      return { name: meta.name, prefix: meta.displayIdPrefix, description };
    }
  }
  const legacy = await readMaybe(path.join(parentAbs, name, LEGACY_SUITE_FILE));
  if (legacy != null) {
    const { suite } = parseSuite(legacy);
    return { name: suite.title, prefix: undefined, description: suite.description ?? '' };
  }
  return null;
}

/** Fold a per-case sidecar's checklist items into the `checks`/`failNotes`/`itemText` maps. */
function foldItems(
  items: RunCaseItem[],
  checks: Record<string, 'none' | 'pass' | 'fail'>,
  failNotes: Record<string, string>,
  itemText: Record<string, string>,
): void {
  for (const it of items) {
    checks[it.key] = it.state;
    if (it.failNote) failNotes[it.key] = it.failNote;
    itemText[it.key] = it.text;
  }
}

/**
 * Load all runs from `.casewright/runs/` once for the whole repo (PRD §4 req 16, 20).
 * A run is a folder: `_run.md` (details) plus one `NNN-<id>.md` sidecar per seeded case.
 * Runs are repo-level; rows may reference cases from any workspace.
 */
async function loadRuns(repoPath: string, warnings: LintWarning[]): Promise<Run[]> {
  const path = node.path();
  const runsAbs = path.join(repoPath, RUNS_REL);
  const entries = await node
    .fsp()
    .readdir(runsAbs, { withFileTypes: true })
    .catch(() => []);
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).sort(byName).reverse();
  const runs: Run[] = [];

  for (const d of dirs) {
    const stem = d.name;
    const dirAbs = path.join(runsAbs, stem);
    const dirRel = relJoin(RUNS_REL, stem);

    const detailsRaw = await readMaybe(path.join(dirAbs, '_run.md'));
    const det = detailsRaw ? parseRunDetails(detailsRaw) : null;
    if (det) for (const x of det.warnings) warnings.push({ ...x, file: relJoin(dirRel, '_run.md') });

    const caseEntries = await node
      .fsp()
      .readdir(dirAbs, { withFileTypes: true })
      .catch(() => []);
    const caseFiles = caseEntries
      .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== '_run.md')
      .sort(byName);

    const rows: Run['rows'] = [];
    for (const cf of caseFiles) {
      const text = (await readMaybe(path.join(dirAbs, cf.name))) ?? '';
      const { runCase, warnings: w } = parseRunCase(text);
      const file = relJoin(dirRel, cf.name);
      for (const x of w) warnings.push({ ...x, file });

      const checks: Record<string, 'none' | 'pass' | 'fail'> = {};
      const failNotes: Record<string, string> = {};
      const itemText: Record<string, string> = {};
      foldItems(runCase.setup, checks, failNotes, itemText);
      foldItems(runCase.steps, checks, failNotes, itemText);
      foldItems(runCase.accept, checks, failNotes, itemText);

      rows.push({
        case_id: runCase.caseId,
        display_id: runCase.displayId,
        title: runCase.title,
        result: runCase.result,
        tester: runCase.tester,
        executed_at: runCase.executedAt,
        notes: runCase.notes,
        checks,
        failNotes,
        itemText,
        file,
        ...(runCase.testDate ? { testDate: runCase.testDate } : {}),
      });
    }

    runs.push({
      id: dirRel,
      name: det?.details.name || stem,
      file: dirRel,
      created: det?.details.created || stem.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '',
      // Default the test date to the run's creation date for legacy runs without one.
      testDate: det?.details.testDate || det?.details.created || stem.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '',
      status: det?.details.status ?? 'open',
      scope: det?.details.scope ?? '',
      rows,
      summary: det?.details.summary ?? '',
      notes: det?.details.notes ?? '',
      testerApproval: det?.details.testerApproval ?? null,
      reviewerApproval: det?.details.reviewerApproval ?? null,
    });
  }
  return runs;
}

/**
 * Walk one workspace's folders → its suite/case subtree + cases (PRD §4). Suite
 * `id`/`path` are **full repo-relative** so multiple workspaces coexist in one
 * combined tree (see `loadRepo`). Runs are loaded separately at the repo level.
 */
export async function loadWorkspace(repoPath: string, ws: Workspace): Promise<LoadedWorkspace> {
  const path = node.path();
  const fsp = node.fsp();
  const wsAbs = path.join(repoPath, ws.path);
  const warnings: LintWarning[] = [];
  const cases: Case[] = [];

  // fullRel = the dir's full repo-relative path; cases at the workspace root belong
  // to the workspace node (id = ws.id). Dot-folders (incl. `.casewright`) are skipped.
  const walk = async (absDir: string, fullRel: string): Promise<TreeNode[]> => {
    const entries = await fsp.readdir(absDir, { withFileTypes: true });
    const dirNames = new Set(entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name));
    // A `.md` is a FOLDER NOTE (a sibling page for its folder) iff a directory of the same
    // basename sits beside it; otherwise it's a test case. Legacy `_suite.md` is excluded too.
    const isFolderNote = (fileName: string) => dirNames.has(fileName.slice(0, -3));
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== LEGACY_SUITE_FILE && !isFolderNote(e.name))
      .sort(byName);
    const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).sort(byName);
    const nodes: TreeNode[] = [];
    // The workspace-root level reuses the (already-normalized, never-empty) workspace
    // id so a root workspace (`ws.path === ''`) doesn't get an empty suite id.
    const suiteId = fullRel === ws.path ? ws.id : slug(fullRel);

    for (const f of files) {
      const text = (await readMaybe(path.join(absDir, f.name))) ?? '';
      const parsed = parseCase(text);
      cases.push({ ...parsed.case, suite: suiteId, modified: false });
      nodes.push({ type: 'case', id: parsed.case.id });
      for (const w of parsed.warnings) warnings.push({ ...w, file: relJoin(fullRel, f.name) });
    }
    for (const d of dirs) {
      const childFull = relJoin(fullRel, d.name);
      const meta = await readSuiteMeta(absDir, entries, d.name);
      const children = await walk(path.join(absDir, d.name), childFull);
      nodes.push({
        type: 'suite',
        id: slug(childFull),
        name: meta?.name?.trim() || d.name,
        path: childFull,
        ...(meta?.prefix?.trim() ? { prefix: meta.prefix.trim() } : {}),
        ...(meta?.description?.trim() ? { description: meta.description } : {}),
        children,
      });
    }
    return nodes;
  };

  const tree = await walk(wsAbs, ws.path);
  return { tree, cases, warnings };
}

/**
 * Load every workspace and combine them into one tree where each workspace is a
 * top-level collapsible folder (a suite node with `isWorkspace: true`), with its
 * suite/case subtree nested underneath. Runs are loaded once at the repo level.
 */
export async function loadRepo(repoPath: string, workspaces: Workspace[]): Promise<LoadedRepo> {
  const tree: TreeNode[] = [];
  const cases: Case[] = [];
  const warnings: LintWarning[] = [];
  for (const ws of workspaces) {
    const loaded = await loadWorkspace(repoPath, ws);
    // The workspace root carries its own prefix/description so display-ID prefixes
    // inherit uniformly down the combined tree (workspace → suite → case).
    tree.push({
      type: 'suite',
      isWorkspace: true,
      id: ws.id,
      name: ws.name,
      path: ws.path,
      prefix: ws.prefix,
      ...(ws.description.trim() ? { description: ws.description } : {}),
      children: loaded.tree,
    });
    cases.push(...loaded.cases);
    warnings.push(...loaded.warnings);
  }

  // Duplicate displayIdPrefix anywhere in the tree (workspace or suite override) → warn, load anyway.
  const seenPrefix = new Map<string, string>();
  const checkDup = (nodes: TreeNode[]) =>
    nodes.forEach((n) => {
      if (n.type !== 'suite') return;
      if (n.prefix) {
        const prev = seenPrefix.get(n.prefix);
        if (prev) warnings.push({ code: 'dup-prefix', message: `Display ID prefix "${n.prefix}" is shared by "${prev}" and "${n.name}".` });
        else seenPrefix.set(n.prefix, n.name);
      }
      checkDup(n.children);
    });
  checkDup(tree);

  const runs = await loadRuns(repoPath, warnings);
  return { tree, cases, runs, warnings };
}

// ---------------------------------------------------------------------------
// Self-write tracking — lets the file watcher (services/watch.ts) ignore the
// app's own writes so they don't trigger an external-change reload.
// ---------------------------------------------------------------------------

const SELF_WRITE_TTL = 4000; // ms a path stays "recently written by us"
const recentWrites = new Map<string, number>();

/** Record that we just wrote `rel` (and its parent dir, since fs.watch also fires for it). */
export function markWrite(rel: string): void {
  const norm = rel.replace(/\\/g, '/');
  const now = Date.now();
  recentWrites.set(norm, now);
  const slash = norm.lastIndexOf('/');
  if (slash > 0) recentWrites.set(norm.slice(0, slash), now);
}

/** True if `rel` was written by us within the TTL (prunes stale entries as it goes). */
export function wasSelfWrite(rel: string): boolean {
  const now = Date.now();
  for (const [k, t] of recentWrites) if (now - t > SELF_WRITE_TTL) recentWrites.delete(k);
  const t = recentWrites.get(rel.replace(/\\/g, '/'));
  return t != null && now - t <= SELF_WRITE_TTL;
}

// ---------------------------------------------------------------------------
// Write path — low-level, repo-relative fs ops (PRD §6.2–6.5)
// The store composes these with the serializers + its path/tree knowledge.
// ---------------------------------------------------------------------------

/** Write `content` to `<repoPath>/<rel>`, creating parent dirs as needed. */
export async function writeFileAt(repoPath: string, rel: string, content: string): Promise<void> {
  const path = node.path();
  const abs = path.join(repoPath, rel);
  markWrite(rel);
  await node.fsp().mkdir(path.dirname(abs), { recursive: true });
  await node.fsp().writeFile(abs, content);
}

/** Delete `<repoPath>/<rel>` (file or directory, recursive). */
export async function deletePath(repoPath: string, rel: string): Promise<void> {
  markWrite(rel);
  await node.fsp().rm(node.path().join(repoPath, rel), { recursive: true, force: true });
}

/** Move/rename `<repoPath>/<fromRel>` → `<repoPath>/<toRel>`, creating the target's parent. */
export async function renamePath(repoPath: string, fromRel: string, toRel: string): Promise<void> {
  if (fromRel === toRel) return;
  const path = node.path();
  const to = path.join(repoPath, toRel);
  markWrite(fromRel);
  markWrite(toRel);
  await node.fsp().mkdir(path.dirname(to), { recursive: true });
  await node.fsp().rename(path.join(repoPath, fromRel), to);
}

/** Create directory `<repoPath>/<rel>` (recursive, idempotent). */
export async function makeDir(repoPath: string, rel: string): Promise<void> {
  markWrite(rel);
  await node.fsp().mkdir(node.path().join(repoPath, rel), { recursive: true });
}

// ---------------------------------------------------------------------------
// Folder-note + config writers — the lazy persistence layer the store composes.
// ---------------------------------------------------------------------------

/** Read + parse `.casewright/config.yaml` tolerantly (defaults when missing/invalid). */
async function readConfig(repoPath: string): Promise<ConfigYaml> {
  const raw = await readMaybe(node.path().join(repoPath, CONFIG_REL));
  const parsed = ConfigYamlSchema.safeParse(raw ? parseYamlDoc(raw) : {});
  return parsed.success ? parsed.data : ConfigYamlSchema.parse({});
}

/** Write the root workspace's metadata into `config.yaml` (it has no sibling note). */
async function writeRootMeta(repoPath: string, meta: FolderNoteMeta): Promise<void> {
  const cfg = await readConfig(repoPath);
  await writeFileAt(
    repoPath,
    CONFIG_REL,
    serializeConfigYaml({
      version: cfg.version,
      name: meta.name || cfg.name,
      displayIdPrefix: meta.prefix,
      description: meta.description,
      workspaces: cfg.workspaces,
    }),
  );
}

/**
 * Lazily persist a folder's note: write `<folder>.md` only when it carries metadata
 * beyond the folder name ({@link noteNeeded}); otherwise delete any existing note. Skips
 * the write when the on-disk content already matches (so it's safe to call on every edit
 * and during idempotent migration). Returns `true` when it changed the disk.
 */
export async function syncFolderNote(repoPath: string, folderRel: string, meta: FolderNoteMeta): Promise<boolean> {
  if (folderRel === '' || folderRel === '.') {
    await writeRootMeta(repoPath, meta);
    return true;
  }
  const noteRel = folderNoteRel(folderRel);
  const abs = node.path().join(repoPath, noteRel);
  const existing = await readMaybe(abs);
  if (noteNeeded(baseOf(folderRel), meta)) {
    const desired = serializeFolderNote(meta);
    if (existing === desired) return false;
    await writeFileAt(repoPath, noteRel, desired);
    return true;
  }
  if (existing == null) return false;
  await deletePath(repoPath, noteRel);
  return true;
}

/** Move a folder's sibling note to follow the folder, if (and only if) a note exists. */
export async function moveFolderNote(repoPath: string, fromFolderRel: string, toFolderRel: string): Promise<void> {
  const from = folderNoteRel(fromFolderRel);
  const to = folderNoteRel(toFolderRel);
  if (from === to) return;
  if ((await readMaybe(node.path().join(repoPath, from))) == null) return;
  await renamePath(repoPath, from, to);
}

/** Rewrite `config.yaml`'s `workspaces:` list, preserving version/name/root metadata. */
export async function writeWorkspacesList(repoPath: string, paths: string[]): Promise<void> {
  const cfg = await readConfig(repoPath);
  await writeFileAt(
    repoPath,
    CONFIG_REL,
    serializeConfigYaml({
      version: cfg.version,
      name: cfg.name,
      displayIdPrefix: cfg.displayIdPrefix,
      description: cfg.description,
      workspaces: paths.map((p) => (p === '' ? '.' : p)),
    }),
  );
}

/**
 * If a folder's basename isn't wiki-safe (spaces/illegal chars), rename it (and move any
 * sibling note alongside) to the slugged form, disambiguating on collision. Returns the
 * (possibly new) repo-relative path. The original name is preserved by callers as the
 * note's display `name`.
 */
export async function ensureWikiSafeFolder(repoPath: string, folderRel: string): Promise<string> {
  if (folderRel === '' || folderRel === '.') return folderRel;
  const base = baseOf(folderRel);
  if (!needsWikiFix(base)) return folderRel;
  const safe = folderSlug(base);
  if (!safe || safe === base) return folderRel;
  const parent = parentOf(folderRel);
  let target = relJoin(parent, safe);
  let n = 2;
  while (target !== folderRel && (await isDir(node.path().join(repoPath, target)))) {
    target = relJoin(parent, `${safe}-${n++}`);
  }
  await moveFolderNote(repoPath, folderRel, target);
  await renamePath(repoPath, folderRel, target);
  return target;
}

// ---------------------------------------------------------------------------
// Migration — legacy (casewright.yaml/_suite.md) → config + folder notes, and
// folder-name normalization to wiki-safe slugs. Runs on open; fully idempotent.
// ---------------------------------------------------------------------------

/** Walk the tree for legacy `casewright.yaml` markers (the old discovery walk). */
async function findLegacyWorkspaceMarkers(repoPath: string): Promise<string[]> {
  const path = node.path();
  const fsp = node.fsp();
  const found: string[] = [];
  const walk = async (relDir: string): Promise<void> => {
    const absDir = relDir === '' ? repoPath : path.join(repoPath, relDir);
    const entries = await fsp.readdir(absDir, { withFileTypes: true }).catch(() => []);
    if (entries.some((e) => e.isFile() && e.name === WORKSPACE_MARKER)) {
      found.push(relDir);
      return; // legacy: workspaces don't nest
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      await walk(relDir === '' ? e.name : `${relDir}/${e.name}`);
    }
  };
  await walk('');
  return found;
}

/** Convert every legacy `_suite.md` under `wsRel` into a sibling folder note (lazy), then
 *  delete the legacy file. */
async function migrateSuiteFilesIn(repoPath: string, wsRel: string): Promise<boolean> {
  const path = node.path();
  const fsp = node.fsp();
  let changed = false;
  const walk = async (dirRel: string): Promise<void> => {
    const absDir = dirRel === '' ? repoPath : path.join(repoPath, dirRel);
    const entries = await fsp.readdir(absDir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const childRel = relJoin(dirRel, e.name);
      const suiteFileRel = relJoin(childRel, LEGACY_SUITE_FILE);
      const suiteRaw = await readMaybe(path.join(repoPath, suiteFileRel));
      if (suiteRaw != null) {
        const { suite } = parseSuite(suiteRaw);
        await syncFolderNote(repoPath, childRel, { name: suite.title ?? '', description: suite.description ?? '' });
        await deletePath(repoPath, suiteFileRel); // remove the legacy file once converted
        changed = true;
      }
      await walk(childRel);
    }
  };
  await walk(wsRel);
  return changed;
}

/**
 * Recursively rename folders with non-wiki-safe basenames to the slugged form (bottom-up,
 * so a parent rename never invalidates a child operation), moving any sibling note along
 * and recording the original name as the note's display `name`. Returns the (possibly new)
 * path of `folderRel`.
 */
async function normalizeFoldersWikiSafe(repoPath: string, folderRel: string, warnings: LintWarning[]): Promise<string> {
  const path = node.path();
  const fsp = node.fsp();
  const absDir = path.join(repoPath, folderRel);
  const entries = await fsp.readdir(absDir, { withFileTypes: true }).catch(() => []);
  for (const name of entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name)) {
    await normalizeFoldersWikiSafe(repoPath, relJoin(folderRel, name), warnings);
  }

  const base = baseOf(folderRel);
  if (!needsWikiFix(base)) return folderRel;
  const safe = folderSlug(base);
  if (!safe || safe === base) return folderRel;

  const parent = parentOf(folderRel);
  let target = relJoin(parent, safe);
  let n = 2;
  while (await isDir(path.join(repoPath, target))) target = relJoin(parent, `${safe}-${n++}`);

  // Preserve any existing note's contents; default the display name to the original basename.
  const oldNote = folderNoteRel(folderRel);
  const noteRaw = await readMaybe(path.join(repoPath, oldNote));
  let meta: FolderNoteMeta = { name: base };
  if (noteRaw != null) {
    const parsed = parseFolderNote(noteRaw);
    meta = { name: parsed.meta.name || base, prefix: parsed.meta.displayIdPrefix, description: parsed.description };
    await deletePath(repoPath, oldNote);
  }
  await renamePath(repoPath, folderRel, target);
  await syncFolderNote(repoPath, target, meta);
  warnings.push({ code: 'renamed', message: `Renamed "${folderRel}" → "${target}" for wiki compatibility (kept "${meta.name}" as its display name).` });
  return target;
}

/**
 * Auto-migrate a repo on open: legacy `casewright.yaml`/`_suite.md` → `config.yaml`
 * `workspaces:` + sibling folder notes, then normalize folder names to wiki-safe slugs.
 * The legacy files are **deleted** once converted; a fallback reader still understands any
 * that linger (e.g. from a partial run). Idempotent — a migrated repo is a no-op on re-open.
 */
export async function migrateRepo(repoPath: string, warnings: LintWarning[]): Promise<void> {
  const cfg = await readConfig(repoPath);
  let wsList = cfg.workspaces.map((p) => (p === '.' ? '' : p));
  const before = [...wsList];
  let changed = false;

  // 1. Legacy markers → workspace list + folder notes (then delete the legacy files).
  for (const rel of await findLegacyWorkspaceMarkers(repoPath)) {
    if (!wsList.includes(rel)) {
      wsList.push(rel);
      changed = true;
    }
    const markerRel = relJoin(rel, WORKSPACE_MARKER);
    const wsRaw = await readMaybe(node.path().join(repoPath, markerRel));
    if (wsRaw != null) {
      const parsed = WorkspaceYamlSchema.safeParse(parseYamlDoc(wsRaw));
      const y = parsed.success ? parsed.data : WorkspaceYamlSchema.parse({});
      if (rel === '') await writeRootMeta(repoPath, { name: y.name, prefix: y.displayIdPrefix, description: y.description ?? '' });
      else await syncFolderNote(repoPath, rel, { name: y.name, prefix: y.displayIdPrefix, description: y.description ?? '' });
      await deletePath(repoPath, markerRel); // remove the legacy marker once converted
      changed = true;
    }
    if (await migrateSuiteFilesIn(repoPath, rel)) changed = true;
  }

  // 2. Normalize folder names (rename folders with spaces/illegal chars) within each workspace.
  const remap: Record<string, string> = {};
  for (const rel of wsList) {
    if (rel === '') continue;
    const next = await normalizeFoldersWikiSafe(repoPath, rel, warnings);
    if (next !== rel) {
      remap[rel] = next;
      changed = true;
    }
  }
  if (Object.keys(remap).length) wsList = wsList.map((p) => remap[p] ?? p);

  // 3. Persist the workspace list if anything changed.
  if (changed || JSON.stringify(before) !== JSON.stringify(wsList)) {
    await writeWorkspacesList(repoPath, wsList);
    warnings.push({ code: 'migrated', message: `Migrated to the config + folder-note format (${wsList.length} workspace${wsList.length === 1 ? '' : 's'}). Review and commit.` });
  }
}
