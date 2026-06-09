import { node } from '@/lib/node';
import { ConfigYamlSchema, WorkspaceYamlSchema, type LintWarning } from '@/schemas';
import type { Case, Run, TreeNode, Workspace } from '@/types';
import { slug } from '@/utils/ids';
import { parseCase } from './format/case';
import { CASEWRIGHT_GITIGNORE, serializeConfigYaml } from './format/config';
import { parseRunCsv, parseRunSidecar } from './format/run';
import { parseSuite } from './format/suite';

// ---------------------------------------------------------------------------
// `.casewright/` layout (PRD §4). The repo is identified by `.casewright/`; each
// workspace declares itself with a `casewright.yaml`; runs are centralized.
// ---------------------------------------------------------------------------

const CASEWRIGHT_DIR = '.casewright';
const CONFIG_REL = '.casewright/config.yaml';
const RUNS_REL = '.casewright/runs';
const WORKSPACE_MARKER = 'casewright.yaml';

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
 * Discover workspaces by walking from the repo root for `casewright.yaml` markers
 * (PRD §4 req 6–9). Skips `.git`, `.casewright`, and any dot-folder; a folder with
 * the marker is a workspace and the walk does **not** descend into it (no nesting).
 * If the root itself has the marker, the whole repo is one workspace (`'.'`).
 */
async function discoverWorkspaces(repoPath: string): Promise<string[]> {
  const path = node.path();
  const fsp = node.fsp();
  const found: string[] = [];

  const walk = async (relDir: string): Promise<void> => {
    const absDir = relDir === '.' ? repoPath : path.join(repoPath, relDir);
    const entries = await fsp.readdir(absDir, { withFileTypes: true }).catch(() => []);
    if (entries.some((e) => e.isFile() && e.name === WORKSPACE_MARKER)) {
      found.push(relDir); // this folder is a workspace — don't descend (req 8)
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue; // skip .git/.casewright/dot-folders (req 7)
      await walk(relDir === '.' ? e.name : `${relDir}/${e.name}`);
    }
  };

  await walk('.');
  return found;
}

async function loadWorkspaceMeta(repoPath: string, rel: string, warnings: LintWarning[]): Promise<Workspace> {
  const path = node.path();
  const wsPath = rel === '.' ? '' : rel; // repo root is represented as '' (no './' prefix downstream)
  const raw = await readMaybe(path.join(repoPath, wsPath, WORKSPACE_MARKER));
  const parsed = WorkspaceYamlSchema.safeParse(raw ? parseYamlDoc(raw) : {});
  const yaml = parsed.success ? parsed.data : WorkspaceYamlSchema.parse({});
  const baseName = rel === '.' ? path.basename(repoPath) : path.basename(rel);
  const markerFile = relJoin(wsPath, WORKSPACE_MARKER);

  let name = yaml.name.trim();
  if (!name) {
    name = baseName;
    warnings.push({ code: 'ws-name', message: `Workspace at "${wsPath || '.'}" has no name; using "${baseName}".`, file: markerFile });
  }
  let prefix = yaml.displayIdPrefix.trim();
  if (!prefix) {
    prefix = derivePrefix(name);
    warnings.push({ code: 'ws-prefix', message: `Workspace "${name}" has no displayIdPrefix; using "${prefix}".`, file: markerFile });
  }

  return {
    id: slug(rel) || slug(baseName) || 'workspace',
    name,
    path: wsPath,
    description: yaml.description ?? '',
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

  const configRaw = await readMaybe(path.join(repoPath, CONFIG_REL));
  if (configRaw && !ConfigYamlSchema.safeParse(parseYamlDoc(configRaw)).success) {
    warnings.push({ code: 'config', message: '.casewright/config.yaml was invalid; using defaults.', file: CONFIG_REL });
  }

  const relPaths = await discoverWorkspaces(repoPath);
  const workspaces: Workspace[] = [];
  for (const rel of relPaths) workspaces.push(await loadWorkspaceMeta(repoPath, rel, warnings));
  workspaces.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path)); // req 10

  if (!workspaces.length) {
    warnings.push({ code: 'empty-repo', message: 'No workspaces found — create a casewright.yaml to declare one.' });
  }

  // Duplicate displayIdPrefix → warn, load anyway (req 14).
  const seenPrefix = new Map<string, string>();
  for (const ws of workspaces) {
    if (!ws.prefix) continue;
    const prev = seenPrefix.get(ws.prefix);
    if (prev) warnings.push({ code: 'dup-prefix', message: `Display ID prefix "${ws.prefix}" is shared by "${prev}" and "${ws.name}".` });
    else seenPrefix.set(ws.prefix, ws.name);
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

async function suiteDisplayName(absDir: string, folderName: string): Promise<string> {
  const raw = await readMaybe(node.path().join(absDir, '_suite.md'));
  if (raw) {
    const { suite } = parseSuite(raw);
    if (suite.title) return suite.title;
  }
  return folderName;
}

/**
 * Load all runs from `.casewright/runs/` once for the whole repo (PRD §4 req 16, 20).
 * A run is repo-level; its rows may reference cases from any workspace, so `file`/`id`
 * carry no workspace path.
 */
async function loadRuns(repoPath: string, warnings: LintWarning[]): Promise<Run[]> {
  const path = node.path();
  const runsAbs = path.join(repoPath, RUNS_REL);
  const entries = await node
    .fsp()
    .readdir(runsAbs, { withFileTypes: true })
    .catch(() => []);
  const csvs = entries.filter((e) => e.isFile() && e.name.endsWith('.csv')).sort(byName).reverse();
  const runs: Run[] = [];
  for (const f of csvs) {
    const text = (await readMaybe(path.join(runsAbs, f.name))) ?? '';
    const { rows, warnings: w } = parseRunCsv(text);
    const file = relJoin(RUNS_REL, f.name); // .casewright/runs/<name>.csv
    for (const x of w) warnings.push({ ...x, file });

    const stem = f.name.replace(/\.csv$/, '');
    let name = stem;
    let status: 'open' | 'closed' = 'open';
    const sidecarRaw = await readMaybe(path.join(runsAbs, `${stem}.md`));
    if (sidecarRaw) {
      const { sidecar } = parseRunSidecar(sidecarRaw);
      name = sidecar.name ?? stem;
      status = sidecar.status;
    }
    runs.push({
      id: relJoin(RUNS_REL, stem),
      name,
      file,
      created: stem.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '',
      status,
      scope: '',
      rows,
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
    const files = entries.filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== '_suite.md').sort(byName);
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
      const children = await walk(path.join(absDir, d.name), childFull);
      nodes.push({
        type: 'suite',
        id: slug(childFull),
        name: await suiteDisplayName(path.join(absDir, d.name), d.name),
        path: childFull,
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
    tree.push({ type: 'suite', isWorkspace: true, id: ws.id, name: ws.name, path: ws.path, children: loaded.tree });
    cases.push(...loaded.cases);
    warnings.push(...loaded.warnings);
  }
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
