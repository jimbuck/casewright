import { node } from '@/lib/node';
import { RootConfigSchema, WorkspaceYamlSchema, type LintWarning } from '@/schemas';
import type { Case, Run, TreeNode, Workspace } from '@/types';
import { slug } from '@/utils/ids';
import { parseCase } from './format/case';
import { parseRunCsv, parseRunSidecar } from './format/run';
import { parseSuite } from './format/suite';

// ---------------------------------------------------------------------------
// Small fs helpers (all Node access goes through the bridge)
// ---------------------------------------------------------------------------

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

/** Parse a standalone YAML document (e.g. `workspace.yaml`) by wrapping it as front matter. */
function parseYamlDoc(raw: string): Record<string, unknown> {
  const wrapped = `---\n${raw.replace(/\r\n/g, '\n').trim()}\n---\n`;
  return (node.matter()(wrapped).data ?? {}) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Open repo → resolve workspaces
// ---------------------------------------------------------------------------

export interface OpenedRepo {
  repoPath: string;
  workspaces: Workspace[];
  branch: string;
  warnings: LintWarning[];
}

/** Resolve `casewright.json` workspace globs (`qa/*`, explicit paths) to relative dirs. */
async function resolveWorkspacePaths(repoPath: string, patterns: string[]): Promise<string[]> {
  const path = node.path();
  const out: string[] = [];
  for (const pat of patterns) {
    if (pat.endsWith('/*')) {
      const base = pat.slice(0, -2);
      try {
        const entries = await node.fsp().readdir(path.join(repoPath, base), { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory() && !e.name.startsWith('.')) out.push(base ? `${base}/${e.name}` : e.name);
        }
      } catch {
        /* base dir missing — skip */
      }
    } else if (await isDir(path.join(repoPath, pat))) {
      out.push(pat);
    }
  }
  return [...new Set(out)];
}

async function loadWorkspaceMeta(repoPath: string, rel: string): Promise<Workspace> {
  const path = node.path();
  const raw = await readMaybe(path.join(repoPath, rel, 'workspace.yaml'));
  const parsed = WorkspaceYamlSchema.safeParse(raw ? parseYamlDoc(raw) : {});
  const yaml = parsed.success ? parsed.data : WorkspaceYamlSchema.parse({});
  const baseName = rel === '.' ? path.basename(repoPath) : path.basename(rel);
  return {
    id: slug(rel) || slug(baseName) || 'workspace',
    name: yaml.name || baseName,
    path: rel === '.' ? '' : rel, // repo root is represented as '' (no './' prefix downstream)
    description: yaml.description ?? '',
    prefix: yaml.displayIdPrefix,
    runsDir: yaml.runsDir,
  };
}

/**
 * Open a repository: validate the git worktree, read `casewright.json` (or fall back
 * to a single implicit workspace), and resolve the declared workspaces (PRD §5.1, §6.1).
 */
export async function openRepo(repoPath: string): Promise<OpenedRepo> {
  const path = node.path();
  const warnings: LintWarning[] = [];

  const git = node.simpleGit()(repoPath);
  if (!(await git.checkIsRepo())) {
    throw new Error(`Not a Git repository: ${repoPath}`);
  }
  const branch = (await git.branchLocal()).current || 'main';

  let patterns: string[] = [];
  const configRaw = await readMaybe(path.join(repoPath, 'casewright.json'));
  if (configRaw) {
    try {
      const cfg = RootConfigSchema.safeParse(JSON.parse(configRaw));
      if (cfg.success) patterns = cfg.data.workspaces;
      else warnings.push({ code: 'config', message: 'casewright.json was invalid; ignoring it.' });
    } catch {
      warnings.push({ code: 'config-json', message: 'casewright.json was not valid JSON; ignoring it.' });
    }
  } else {
    warnings.push({ code: 'no-config', message: 'No casewright.json — treating the folder as a single workspace.' });
  }

  const relPaths = patterns.length ? await resolveWorkspacePaths(repoPath, patterns) : ['.'];
  const workspaces: Workspace[] = [];
  for (const rel of relPaths) workspaces.push(await loadWorkspaceMeta(repoPath, rel));
  if (!workspaces.length) {
    warnings.push({ code: 'no-workspaces', message: 'No workspaces matched; using the repo root.' });
    workspaces.push(await loadWorkspaceMeta(repoPath, '.'));
  }

  return { repoPath, workspaces, branch, warnings };
}

// ---------------------------------------------------------------------------
// Load a workspace → tree + cases + runs
// ---------------------------------------------------------------------------

export interface LoadedWorkspace {
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

async function loadRuns(runsAbs: string, ws: Workspace, warnings: LintWarning[]): Promise<Run[]> {
  const path = node.path();
  const entries = await node
    .fsp()
    .readdir(runsAbs, { withFileTypes: true })
    .catch(() => []);
  const csvs = entries.filter((e) => e.isFile() && e.name.endsWith('.csv')).sort(byName).reverse();
  const runs: Run[] = [];
  for (const f of csvs) {
    const text = (await readMaybe(path.join(runsAbs, f.name))) ?? '';
    const { rows, warnings: w } = parseRunCsv(text);
    const file = relJoin(ws.path, ws.runsDir, f.name); // full repo-relative path
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
      id: relJoin(ws.path, ws.runsDir, stem),
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
 * Walk one workspace's folders → its suite/case subtree + cases + runs (PRD §5.3).
 * Suite `id`/`path` and run `file` are **full repo-relative** so multiple workspaces
 * can coexist in one combined tree (see `loadRepo`).
 */
export async function loadWorkspace(repoPath: string, ws: Workspace): Promise<LoadedWorkspace> {
  const path = node.path();
  const fsp = node.fsp();
  const wsAbs = path.join(repoPath, ws.path);
  const warnings: LintWarning[] = [];
  const cases: Case[] = [];

  // fullRel = the dir's full repo-relative path; cases at the workspace root belong
  // to the workspace node (id = slug(ws.path)).
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
      if (fullRel === ws.path && d.name === ws.runsDir) continue; // runs/ at the root isn't a suite
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
  const runs = await loadRuns(path.join(wsAbs, ws.runsDir), ws, warnings);
  return { tree, cases, runs, warnings };
}

/**
 * Load every workspace and combine them into one tree where each workspace is a
 * top-level collapsible folder (a suite node with `isWorkspace: true`), with its
 * suite/case subtree nested underneath.
 */
export async function loadRepo(repoPath: string, workspaces: Workspace[]): Promise<LoadedWorkspace> {
  const tree: TreeNode[] = [];
  const cases: Case[] = [];
  const runs: Run[] = [];
  const warnings: LintWarning[] = [];
  for (const ws of workspaces) {
    const loaded = await loadWorkspace(repoPath, ws);
    tree.push({ type: 'suite', isWorkspace: true, id: ws.id, name: ws.name, path: ws.path, children: loaded.tree });
    cases.push(...loaded.cases);
    runs.push(...loaded.runs);
    warnings.push(...loaded.warnings);
  }
  return { tree, cases, runs, warnings };
}

// ---------------------------------------------------------------------------
// Write path — low-level, repo-relative fs ops (PRD §6.2–6.5)
// The store composes these with the serializers + its path/tree knowledge.
// ---------------------------------------------------------------------------

/** Write `content` to `<repoPath>/<rel>`, creating parent dirs as needed. */
export async function writeFileAt(repoPath: string, rel: string, content: string): Promise<void> {
  const path = node.path();
  const abs = path.join(repoPath, rel);
  await node.fsp().mkdir(path.dirname(abs), { recursive: true });
  await node.fsp().writeFile(abs, content);
}

/** Delete `<repoPath>/<rel>` (file or directory, recursive). */
export async function deletePath(repoPath: string, rel: string): Promise<void> {
  await node.fsp().rm(node.path().join(repoPath, rel), { recursive: true, force: true });
}

/** Move/rename `<repoPath>/<fromRel>` → `<repoPath>/<toRel>`, creating the target's parent. */
export async function renamePath(repoPath: string, fromRel: string, toRel: string): Promise<void> {
  if (fromRel === toRel) return;
  const path = node.path();
  const to = path.join(repoPath, toRel);
  await node.fsp().mkdir(path.dirname(to), { recursive: true });
  await node.fsp().rename(path.join(repoPath, fromRel), to);
}

/** Create directory `<repoPath>/<rel>` (recursive, idempotent). */
export async function makeDir(repoPath: string, rel: string): Promise<void> {
  await node.fsp().mkdir(node.path().join(repoPath, rel), { recursive: true });
}
