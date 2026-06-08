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
    path: rel,
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

async function loadRuns(runsAbs: string, runsDirName: string, warnings: LintWarning[]): Promise<Run[]> {
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
    for (const x of w) warnings.push({ ...x, file: `${runsDirName}/${f.name}` });

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
      id: stem,
      name,
      file: `${runsDirName}/${f.name}`,
      created: stem.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? '',
      status,
      scope: '',
      rows,
    });
  }
  return runs;
}

/** Walk a workspace's folders → the suite/case tree + all parsed cases + runs (PRD §5.3). */
export async function loadWorkspace(repoPath: string, ws: Workspace): Promise<LoadedWorkspace> {
  const path = node.path();
  const fsp = node.fsp();
  const wsAbs = path.join(repoPath, ws.path);
  const warnings: LintWarning[] = [];
  const cases: Case[] = [];

  const walk = async (absDir: string, relWithin: string): Promise<TreeNode[]> => {
    const entries = await fsp.readdir(absDir, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== '_suite.md').sort(byName);
    const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).sort(byName);
    const nodes: TreeNode[] = [];
    const suiteId = relWithin ? slug(relWithin) : '';

    for (const f of files) {
      const text = (await readMaybe(path.join(absDir, f.name))) ?? '';
      const parsed = parseCase(text);
      cases.push({ ...parsed.case, suite: suiteId, modified: false });
      nodes.push({ type: 'case', id: parsed.case.id });
      for (const w of parsed.warnings) warnings.push({ ...w, file: path.posix.join(ws.path, relWithin, f.name) });
    }
    for (const d of dirs) {
      if (!relWithin && d.name === ws.runsDir) continue; // runs/ at the workspace root isn't a suite
      const childRel = relWithin ? `${relWithin}/${d.name}` : d.name;
      const children = await walk(path.join(absDir, d.name), childRel);
      nodes.push({
        type: 'suite',
        id: slug(childRel),
        name: await suiteDisplayName(path.join(absDir, d.name), d.name),
        path: childRel,
        children,
      });
    }
    return nodes;
  };

  const tree = await walk(wsAbs, '');
  const runs = await loadRuns(path.join(wsAbs, ws.runsDir), ws.runsDir, warnings);
  return { tree, cases, runs, warnings };
}
