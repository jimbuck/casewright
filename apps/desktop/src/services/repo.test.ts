import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { node } from '@/lib/node';
import { parseCase, serializeCase, type ParsedCase } from './format/case';
import { serializeRunCsv } from './format/run';
import { deletePath, initRepo, loadRepo, loadWorkspace, makeDir, markWrite, openRepo, relJoin, renamePath, toRepoRelative, wasSelfWrite, writeFileAt } from './repo';

const c1: ParsedCase = {
  id: 'aaa1111aaaa',
  displayId: 'PAY-0001',
  title: 'First case',
  status: 'active',
  tags: ['smoke'],
  objective: 'Check the first thing.',
  systems: ['Web app'],
  steps: [
    { text: 'Open the app.', depth: 0 },
    { text: 'Confirm it loads.', depth: 1 },
  ],
  expected: ['It works.'],
};
const c2: ParsedCase = {
  id: 'bbb2222bbbb',
  displayId: 'PAY-0002',
  title: 'Nested case',
  status: 'draft',
  tags: [],
  objective: '',
  systems: [],
  steps: [],
  expected: [],
};

const SMOKE_ROW = {
  case_id: 'aaa1111aaaa',
  display_id: 'PAY-0001',
  title: 'First case',
  result: 'pass' as const,
  tester: 'me',
  executed_at: '2026-06-01 09:00',
  notes: '',
};

async function mkRepo(prefix: string): Promise<string> {
  return node.fsp().mkdtemp(node.path().join(node.os().tmpdir(), prefix));
}

async function gitInit(dir: string): Promise<void> {
  const git = node.simpleGit()(dir);
  await git.init();
  await git.addConfig('user.email', 'test@casewright.dev', false, 'local');
  await git.addConfig('user.name', 'Test', false, 'local');
  await git.add('.');
  await git.commit('seed');
  await git.branch(['-M', 'main']);
}

// ---------------------------------------------------------------------------
// Canonical repo: `.casewright/` + one declared workspace (areas/payments)
// ---------------------------------------------------------------------------
describe('openRepo / loadWorkspace / loadRepo', () => {
  let repoPath: string;

  beforeAll(async () => {
    const fsp = node.fsp();
    const path = node.path();
    repoPath = await mkRepo('cw-repo-');

    await fsp.mkdir(path.join(repoPath, '.casewright', 'runs'), { recursive: true });
    await fsp.writeFile(path.join(repoPath, '.casewright', 'config.yaml'), 'version: 1\nname: QA\n');
    await fsp.writeFile(path.join(repoPath, '.casewright', 'runs', '2026-06-01-smoke.csv'), serializeRunCsv([SMOKE_ROW]));

    const ws = path.join(repoPath, 'areas', 'payments');
    await fsp.mkdir(path.join(ws, 'Auth', 'Sessions'), { recursive: true });
    await fsp.writeFile(path.join(ws, 'casewright.yaml'), 'name: Payments QA\ndisplayIdPrefix: PAY\n');
    await fsp.writeFile(path.join(ws, 'Auth', 'PAY-0001-first-case.md'), serializeCase(c1));
    await fsp.writeFile(path.join(ws, 'Auth', 'Sessions', 'PAY-0002-nested-case.md'), serializeCase(c2));

    await gitInit(repoPath);
  });

  afterAll(async () => {
    await node.fsp().rm(repoPath, { recursive: true, force: true });
  });

  it('validates the worktree and discovers the workspace from its casewright.yaml', async () => {
    const { workspaces, branch, needsInit } = await openRepo(repoPath);
    expect(branch).toBe('main');
    expect(needsInit).toBe(false);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]).toMatchObject({ name: 'Payments QA', prefix: 'PAY', path: 'areas/payments' });
    expect('runsDir' in workspaces[0]).toBe(false);
  });

  it('throws for a non-repo path', async () => {
    const tmp = await mkRepo('cw-norepo-');
    await expect(openRepo(tmp)).rejects.toThrow(/Not a Git repository/);
    await node.fsp().rm(tmp, { recursive: true, force: true });
  });

  it('loadWorkspace builds the tree + cases (runs are repo-level, not here)', async () => {
    const { workspaces } = await openRepo(repoPath);
    const loaded = await loadWorkspace(repoPath, workspaces[0]);
    expect('runs' in loaded).toBe(false);
    expect(loaded.cases.map((c) => c.displayId).sort()).toEqual(['PAY-0001', 'PAY-0002']);

    const first = loaded.cases.find((c) => c.displayId === 'PAY-0001')!;
    expect(first.steps).toEqual(c1.steps);
    expect(first.modified).toBe(false);

    expect(loaded.tree).toHaveLength(1);
    const auth = loaded.tree[0];
    expect(auth.type).toBe('suite');
    if (auth.type === 'suite') {
      expect(auth.name).toBe('Auth');
      expect(auth.children.some((n) => n.type === 'case')).toBe(true);
      expect(auth.children.some((n) => n.type === 'suite' && n.name === 'Sessions')).toBe(true);
    }
  });

  it('loadRepo combines workspaces as top-level folders and loads central runs', async () => {
    const { workspaces } = await openRepo(repoPath);
    const { tree, cases, runs } = await loadRepo(repoPath, workspaces);
    expect(tree).toHaveLength(1);
    expect(tree[0].type).toBe('suite');
    if (tree[0].type === 'suite') {
      expect(tree[0].isWorkspace).toBe(true);
      expect(tree[0].name).toBe('Payments QA');
      expect(tree[0].path).toBe('areas/payments');
    }
    expect(cases).toHaveLength(2);

    // runs come from .casewright/runs/ (repo-level), not per-workspace
    expect(runs).toHaveLength(1);
    expect(runs[0].rows[0].result).toBe('pass');
    expect(runs[0].file).toBe('.casewright/runs/2026-06-01-smoke.csv');
    expect(runs[0].id).toBe('.casewright/runs/2026-06-01-smoke');
  });
});

// ---------------------------------------------------------------------------
// Discovery walk: markers found, dot-folders skipped, alphabetical by name
// ---------------------------------------------------------------------------
describe('workspace discovery walk', () => {
  let repoPath: string;

  beforeAll(async () => {
    const fsp = node.fsp();
    const path = node.path();
    repoPath = await mkRepo('cw-discover-');
    await fsp.mkdir(path.join(repoPath, '.casewright'), { recursive: true });
    await fsp.writeFile(path.join(repoPath, '.casewright', 'config.yaml'), 'version: 1\n');

    // two real workspaces (names chosen so alphabetical-by-name ≠ path order)
    await fsp.mkdir(path.join(repoPath, 'areas', 'alpha'), { recursive: true });
    await fsp.writeFile(path.join(repoPath, 'areas', 'alpha', 'casewright.yaml'), 'name: Zeta\ndisplayIdPrefix: ZET\n');
    await fsp.mkdir(path.join(repoPath, 'areas', 'beta'), { recursive: true });
    await fsp.writeFile(path.join(repoPath, 'areas', 'beta', 'casewright.yaml'), 'name: Alpha\ndisplayIdPrefix: ALP\n');
    // a dot-folder marker (must be skipped) and a plain folder (no marker)
    await fsp.mkdir(path.join(repoPath, '.hidden'), { recursive: true });
    await fsp.writeFile(path.join(repoPath, '.hidden', 'casewright.yaml'), 'name: Hidden\ndisplayIdPrefix: HID\n');
    await fsp.mkdir(path.join(repoPath, 'docs'), { recursive: true });

    await gitInit(repoPath);
  });

  afterAll(async () => {
    await node.fsp().rm(repoPath, { recursive: true, force: true });
  });

  it('finds every casewright.yaml, skips dot-folders, sorts by display name', async () => {
    const { workspaces } = await openRepo(repoPath);
    expect(workspaces).toHaveLength(2); // .hidden is skipped
    expect(workspaces.map((w) => w.name)).toEqual(['Alpha', 'Zeta']);
    expect(workspaces.map((w) => w.path)).toEqual(['areas/beta', 'areas/alpha']);
    expect(workspaces.some((w) => w.name === 'Hidden')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// No nesting: a marker inside a workspace is a suite, not a second workspace
// ---------------------------------------------------------------------------
describe('no nested workspaces', () => {
  let repoPath: string;

  beforeAll(async () => {
    const fsp = node.fsp();
    const path = node.path();
    repoPath = await mkRepo('cw-nest-');
    await fsp.mkdir(path.join(repoPath, '.casewright'), { recursive: true });
    await fsp.writeFile(path.join(repoPath, '.casewright', 'config.yaml'), 'version: 1\n');

    const ws = path.join(repoPath, 'areas', 'payments');
    await fsp.mkdir(path.join(ws, 'Deep'), { recursive: true });
    await fsp.writeFile(path.join(ws, 'casewright.yaml'), 'name: Payments\ndisplayIdPrefix: PAY\n');
    // a (mistaken) marker nested inside the workspace — must be treated as a suite, not a workspace
    await fsp.writeFile(path.join(ws, 'Deep', 'casewright.yaml'), 'name: Deep\ndisplayIdPrefix: DEP\n');
    await fsp.writeFile(path.join(ws, 'Deep', 'PAY-0009-deep.md'), serializeCase({ ...c1, id: 'ccc3333cccc', displayId: 'PAY-0009' }));

    await gitInit(repoPath);
  });

  afterAll(async () => {
    await node.fsp().rm(repoPath, { recursive: true, force: true });
  });

  it('does not descend into a workspace to find more workspaces', async () => {
    const { workspaces } = await openRepo(repoPath);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].path).toBe('areas/payments');

    const { tree } = await loadWorkspace(repoPath, workspaces[0]);
    const deep = tree.find((n) => n.type === 'suite' && n.name === 'Deep');
    expect(deep).toBeTruthy(); // Deep is a suite within the workspace
  });
});

// ---------------------------------------------------------------------------
// Root as a single workspace (replaces the old implicit-fallback case)
// ---------------------------------------------------------------------------
describe('repo root as a single workspace', () => {
  let repoPath: string;

  beforeAll(async () => {
    const fsp = node.fsp();
    const path = node.path();
    repoPath = await mkRepo('cw-root-');
    await fsp.mkdir(path.join(repoPath, '.casewright', 'runs'), { recursive: true });
    await fsp.writeFile(path.join(repoPath, '.casewright', 'config.yaml'), 'version: 1\n');
    await fsp.writeFile(path.join(repoPath, '.casewright', 'runs', '2026-06-02-smoke.csv'), serializeRunCsv([SMOKE_ROW]));
    // root-level marker → the whole repo is one workspace
    await fsp.writeFile(path.join(repoPath, 'casewright.yaml'), 'name: Root WS\ndisplayIdPrefix: RT\n');
    await fsp.writeFile(path.join(repoPath, 'CW-0002-root-case.md'), serializeCase(c2)); // case at the workspace root
    await fsp.mkdir(path.join(repoPath, 'Auth'), { recursive: true });
    await fsp.writeFile(path.join(repoPath, 'Auth', 'CW-0001-nested.md'), serializeCase(c1));

    await gitInit(repoPath);
  });

  afterAll(async () => {
    await node.fsp().rm(repoPath, { recursive: true, force: true });
  });

  it('declares a single workspace at path "" with no further discovery', async () => {
    const { workspaces, needsInit } = await openRepo(repoPath);
    expect(needsInit).toBe(false);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].path).toBe('');
    expect(workspaces[0].name).toBe('Root WS');
    expect(workspaces[0].id).not.toBe('');
  });

  it('emits non-empty suite ids and no "./"-prefixed paths', async () => {
    const { workspaces } = await openRepo(repoPath);
    const ws = workspaces[0];
    const { tree, cases, runs } = await loadRepo(repoPath, workspaces);

    const wsNode = tree[0];
    expect(wsNode.type === 'suite' && wsNode.id).toBe(ws.id);

    if (wsNode.type === 'suite') {
      const auth = wsNode.children.find((n) => n.type === 'suite');
      expect(auth && auth.type === 'suite' && auth.path).toBe('Auth'); // not "./Auth"
    }

    const rootCase = cases.find((c) => c.id === c2.id)!;
    expect(rootCase.suite).toBe(ws.id);
    expect(rootCase.suite).not.toBe('');

    expect(runs).toHaveLength(1);
    expect(runs[0].file).toBe('.casewright/runs/2026-06-02-smoke.csv');
    expect(runs[0].file.startsWith('./')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Missing `.casewright/` → needsInit; present but empty → empty-repo warning
// ---------------------------------------------------------------------------
describe('missing and empty .casewright/', () => {
  it('reports needsInit (without throwing) when .casewright/ is absent', async () => {
    const repoPath = await mkRepo('cw-noinit-');
    await node.fsp().writeFile(node.path().join(repoPath, 'README.md'), 'x\n');
    await gitInit(repoPath);

    const opened = await openRepo(repoPath);
    expect(opened.needsInit).toBe(true);
    expect(opened.workspaces).toHaveLength(0);
    expect(opened.warnings.some((w) => w.code === 'needs-init')).toBe(true);

    await node.fsp().rm(repoPath, { recursive: true, force: true });
  });

  it('reports an empty-repo warning when .casewright/ exists but no markers', async () => {
    const repoPath = await mkRepo('cw-empty-');
    await node.fsp().mkdir(node.path().join(repoPath, '.casewright'), { recursive: true });
    await node.fsp().writeFile(node.path().join(repoPath, '.casewright', 'config.yaml'), 'version: 1\n');
    await gitInit(repoPath);

    const opened = await openRepo(repoPath);
    expect(opened.needsInit).toBe(false);
    expect(opened.workspaces).toHaveLength(0);
    expect(opened.warnings.some((w) => w.code === 'empty-repo')).toBe(true);

    await node.fsp().rm(repoPath, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// initRepo scaffold
// ---------------------------------------------------------------------------
describe('initRepo scaffold', () => {
  it('writes config.yaml, runs/, and a .gitignore that ignores cache/', async () => {
    const fsp = node.fsp();
    const path = node.path();
    const repoPath = await mkRepo('cw-scaffold-');
    await fsp.writeFile(path.join(repoPath, 'README.md'), 'x\n');
    await gitInit(repoPath);

    await initRepo(repoPath);

    const config = await fsp.readFile(path.join(repoPath, '.casewright', 'config.yaml'), 'utf8');
    expect(config).toMatch(/version:\s*1/);
    expect((await fsp.stat(path.join(repoPath, '.casewright', 'runs'))).isDirectory()).toBe(true);
    const ignore = await fsp.readFile(path.join(repoPath, '.casewright', '.gitignore'), 'utf8');
    expect(ignore).toMatch(/cache\//);

    // a freshly-initialized repo opens cleanly with no workspaces yet
    const opened = await openRepo(repoPath);
    expect(opened.needsInit).toBe(false);
    expect(opened.workspaces).toHaveLength(0);
    expect(opened.warnings.some((w) => w.code === 'empty-repo')).toBe(true);

    await fsp.rm(repoPath, { recursive: true, force: true });
  });
});

describe('self-write echo suppression', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('flags a recently self-written path, expiring after the TTL', () => {
    markWrite('areas/payments/Auth/PAY-0001-first.md');
    expect(wasSelfWrite('areas/payments/Auth/PAY-0001-first.md')).toBe(true);
    expect(wasSelfWrite('areas/payments/Other.md')).toBe(false);
    vi.advanceTimersByTime(5000); // past the 4s TTL
    expect(wasSelfWrite('areas/payments/Auth/PAY-0001-first.md')).toBe(false);
  });

  it('normalizes backslashes and also marks the parent dir (fs.watch fires for both)', () => {
    markWrite('areas/payments/Billing/PAY-0088.md');
    expect(wasSelfWrite('areas\\payments\\Billing\\PAY-0088.md')).toBe(true);
    expect(wasSelfWrite('areas/payments/Billing')).toBe(true);
  });
});

describe('toRepoRelative', () => {
  const path = node.path();
  // `path.resolve` yields a genuinely absolute, platform-native path (the contract the
  // helper documents), so these exercise real `path.isAbsolute`/root handling.
  const repo = path.resolve('home', 'user', 'casewright');

  it('returns "" for the repo root itself', () => {
    expect(toRepoRelative(repo, repo)).toBe('');
  });

  it('returns a forward-slash relative path for a folder inside the repo', () => {
    expect(toRepoRelative(repo, path.join(repo, 'areas', 'payments'))).toBe('areas/payments');
    expect(toRepoRelative(repo, path.join(repo, 'Auth'))).toBe('Auth');
  });

  it('returns null for a folder outside the repo', () => {
    expect(toRepoRelative(repo, path.resolve('home', 'user', 'elsewhere'))).toBeNull();
    expect(toRepoRelative(repo, path.resolve('home', 'user'))).toBeNull();
  });
});

describe('relJoin', () => {
  it('treats the repo root ("." or "") as empty — no "./" prefix or leading slash', () => {
    expect(relJoin('', 'runs', 'x.csv')).toBe('runs/x.csv');
    expect(relJoin('.', 'Auth')).toBe('Auth');
    expect(relJoin('areas/payments', 'runs', 'x.csv')).toBe('areas/payments/runs/x.csv');
    expect(relJoin('Auth', 'file.md')).toBe('Auth/file.md');
    expect(relJoin('.')).toBe('');
  });
});

describe('write primitives', () => {
  let dir: string;
  const exists = async (rel: string) =>
    node
      .fsp()
      .stat(node.path().join(dir, rel))
      .then(() => true)
      .catch(() => false);

  beforeAll(async () => {
    dir = await mkRepo('cw-write-');
  });
  afterAll(async () => {
    await node.fsp().rm(dir, { recursive: true, force: true });
  });

  it('writes a case file, creating parent dirs', async () => {
    await writeFileAt(dir, 'areas/payments/Auth/PAY-0001-first.md', serializeCase(c1));
    expect(await exists('areas/payments/Auth/PAY-0001-first.md')).toBe(true);
    const text = await node.fsp().readFile(node.path().join(dir, 'areas/payments/Auth/PAY-0001-first.md'), 'utf8');
    expect(parseCase(text).case.title).toBe('First case');
  });

  it('renames (moves) a file across folders', async () => {
    await renamePath(dir, 'areas/payments/Auth/PAY-0001-first.md', 'areas/payments/Billing/PAY-0001-first.md');
    expect(await exists('areas/payments/Auth/PAY-0001-first.md')).toBe(false);
    expect(await exists('areas/payments/Billing/PAY-0001-first.md')).toBe(true);
  });

  it('creates a directory and deletes a path', async () => {
    await makeDir(dir, '.casewright/runs');
    expect(await exists('.casewright/runs')).toBe(true);
    await deletePath(dir, 'areas/payments/Billing/PAY-0001-first.md');
    expect(await exists('areas/payments/Billing/PAY-0001-first.md')).toBe(false);
  });
});
