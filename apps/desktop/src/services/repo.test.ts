import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { node } from '@/lib/node';
import { parseCase, serializeCase, type ParsedCase } from './format/case';
import { serializeRunCase, serializeRunDetails } from './format/run';
import { deletePath, initRepo, loadRepo, loadWorkspace, makeDir, markWrite, openRepo, reformatCaseFiles, relJoin, renamePath, toRepoRelative, wasSelfWrite, writeFileAt } from './repo';

const c1: ParsedCase = {
  id: 'aaa1111aaaa',
  displayId: 'PAY-0001',
  title: 'First case',
  status: 'active',
  tags: ['smoke'],
  objective: 'Check the first thing.',
  systems: ['Web app'],
  setup: [{ name: 'Seed data', body: 'A clean database with the **baseline** fixtures loaded.' }],
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
  setup: [],
  steps: [],
  expected: [],
};

/** Write a run folder (`_run.md` + one passing case sidecar) under `.casewright/runs/<folder>/`. */
async function writeSmokeRun(repoPath: string, folder: string): Promise<void> {
  const fsp = node.fsp();
  const path = node.path();
  const dir = path.join(repoPath, '.casewright', 'runs', folder);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(
    path.join(dir, '_run.md'),
    serializeRunDetails({
      name: 'Smoke',
      status: 'open',
      created: folder.slice(0, 10),
      scope: 'repo',
      testerApproval: { name: 'me', at: '2026-06-01 09:05' },
      reviewerApproval: null,
      summary: 'quick smoke',
      notes: '',
    }),
  );
  await fsp.writeFile(
    path.join(dir, '001-PAY-0001-first-case.md'),
    serializeRunCase({
      caseId: 'aaa1111aaaa',
      displayId: 'PAY-0001',
      title: 'First case',
      result: 'pass',
      tester: 'me',
      executedAt: '2026-06-01 09:00',
      notes: '',
      setup: [{ key: 'setup:0', text: 'Confirm Web app is available and reachable.', state: 'pass', failNote: '' }],
      steps: [{ key: 'step:0', text: 'Open the app.', state: 'pass', failNote: '' }],
      accept: [{ key: 'accept:0', text: 'It works.', state: 'pass', failNote: '' }],
    }),
  );
}

async function mkRepo(prefix: string): Promise<string> {
  return node.fsp().mkdtemp(node.path().join(node.os().tmpdir(), prefix));
}

async function gitInit(dir: string): Promise<void> {
  const git = node.simpleGit()(dir);
  await git.init();
  await git.addConfig('user.email', 'test@casewright.dev', false, 'local');
  await git.addConfig('user.name', 'Test', false, 'local');
  await git.addConfig('commit.gpgsign', 'false', false, 'local');
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
    await fsp.writeFile(path.join(repoPath, '.casewright', 'config.yaml'), 'version: 1\nname: QA\nworkspaces:\n  - areas/payments\n');
    await writeSmokeRun(repoPath, '2026-06-01-smoke');

    const ws = path.join(repoPath, 'areas', 'payments');
    await fsp.mkdir(path.join(ws, 'Auth', 'Sessions'), { recursive: true });
    // The workspace's metadata is its sibling folder note (areas/payments.md), not a marker inside.
    await fsp.writeFile(path.join(repoPath, 'areas', 'payments.md'), '---\nname: Payments QA\ndisplayIdPrefix: PAY\n---\n');
    await fsp.writeFile(path.join(ws, 'Auth', 'PAY-0001-first-case.md'), serializeCase(c1));
    await fsp.writeFile(path.join(ws, 'Auth', 'Sessions', 'PAY-0002-nested-case.md'), serializeCase(c2));

    await gitInit(repoPath);
  });

  afterAll(async () => {
    await node.fsp().rm(repoPath, { recursive: true, force: true });
  });

  it('validates the worktree and discovers the workspace from config + its folder note', async () => {
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

    // runs come from .casewright/runs/ (repo-level folders), not per-workspace
    expect(runs).toHaveLength(1);
    expect(runs[0].rows[0].result).toBe('pass');
    expect(runs[0].file).toBe('.casewright/runs/2026-06-01-smoke');
    expect(runs[0].id).toBe('.casewright/runs/2026-06-01-smoke');
    // per-case checklist state and run-level approval are parsed from the folder
    expect(runs[0].rows[0].checks['step:0']).toBe('pass');
    expect(runs[0].rows[0].file).toBe('.casewright/runs/2026-06-01-smoke/001-PAY-0001-first-case.md');
    expect(runs[0].testerApproval).toEqual({ name: 'me', at: '2026-06-01 09:05' });
    expect(runs[0].summary).toBe('quick smoke');
  });
});

// ---------------------------------------------------------------------------
// Discovery from the config workspaces list (sorted by name; unlisted ignored)
// ---------------------------------------------------------------------------
describe('workspace discovery from config', () => {
  let repoPath: string;

  beforeAll(async () => {
    const fsp = node.fsp();
    const path = node.path();
    repoPath = await mkRepo('cw-discover-');
    await fsp.mkdir(path.join(repoPath, '.casewright'), { recursive: true });
    // names chosen so alphabetical-by-name ≠ path order; `areas/ghost` is listed but absent
    await fsp.writeFile(
      path.join(repoPath, '.casewright', 'config.yaml'),
      'version: 1\nworkspaces:\n  - areas/beta\n  - areas/alpha\n  - areas/ghost\n',
    );
    await fsp.mkdir(path.join(repoPath, 'areas', 'alpha'), { recursive: true });
    await fsp.writeFile(path.join(repoPath, 'areas', 'alpha.md'), '---\nname: Zeta\ndisplayIdPrefix: ZET\n---\n');
    await fsp.mkdir(path.join(repoPath, 'areas', 'beta'), { recursive: true });
    await fsp.writeFile(path.join(repoPath, 'areas', 'beta.md'), '---\nname: Alpha\ndisplayIdPrefix: ALP\n---\n');
    // a folder that is NOT in the config list → must be ignored
    await fsp.mkdir(path.join(repoPath, 'areas', 'gamma'), { recursive: true });

    await gitInit(repoPath);
  });

  afterAll(async () => {
    await node.fsp().rm(repoPath, { recursive: true, force: true });
  });

  it('reads the config list, sorts by display name, ignores unlisted folders, warns on a missing one', async () => {
    const { workspaces, warnings } = await openRepo(repoPath);
    expect(workspaces).toHaveLength(2); // ghost is missing; gamma is unlisted
    expect(workspaces.map((w) => w.name)).toEqual(['Alpha', 'Zeta']);
    expect(workspaces.map((w) => w.path)).toEqual(['areas/beta', 'areas/alpha']);
    expect(workspaces.some((w) => w.path === 'areas/gamma')).toBe(false);
    expect(warnings.some((w) => w.code === 'ws-missing')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Folder notes vs test cases: a `.md` with a sibling dir is a note, else a case
// ---------------------------------------------------------------------------
describe('folder notes vs test cases', () => {
  let repoPath: string;

  beforeAll(async () => {
    const fsp = node.fsp();
    const path = node.path();
    repoPath = await mkRepo('cw-notes-');
    await fsp.mkdir(path.join(repoPath, '.casewright'), { recursive: true });
    await fsp.writeFile(path.join(repoPath, '.casewright', 'config.yaml'), 'version: 1\nworkspaces:\n  - areas/payments\n');

    const ws = path.join(repoPath, 'areas', 'payments');
    await fsp.mkdir(path.join(ws, 'Auth'), { recursive: true });
    await fsp.writeFile(path.join(repoPath, 'areas', 'payments.md'), '---\nname: Payments\ndisplayIdPrefix: PAY\n---\n');
    // Auth.md sits beside Auth/ → it's the folder note (suite metadata), not a case.
    await fsp.writeFile(path.join(ws, 'Auth.md'), '---\nname: Authentication\ndisplayIdPrefix: AUTH\n---\n\nAuth suite.\n');
    await fsp.writeFile(path.join(ws, 'Auth', 'PAY-0009-deep.md'), serializeCase({ ...c1, id: 'ccc3333cccc', displayId: 'PAY-0009', title: 'Deep case' }));
    // Login.md has no sibling Login/ dir → it's a test case at the workspace root.
    await fsp.writeFile(path.join(ws, 'Login.md'), serializeCase({ ...c1, id: 'ddd4444dddd', displayId: 'PAY-0010', title: 'Login case' }));

    await gitInit(repoPath);
  });

  afterAll(async () => {
    await node.fsp().rm(repoPath, { recursive: true, force: true });
  });

  it('treats a .md with a sibling dir as a folder note (suite metadata + prefix), and a lone .md as a case', async () => {
    const { workspaces } = await openRepo(repoPath);
    const { tree, cases } = await loadWorkspace(repoPath, workspaces[0]);

    const auth = tree.find((n) => n.type === 'suite' && n.path === 'areas/payments/Auth');
    expect(auth && auth.type === 'suite' && auth.name).toBe('Authentication');
    expect(auth && auth.type === 'suite' && auth.prefix).toBe('AUTH');
    expect(auth && auth.type === 'suite' && auth.description).toBe('Auth suite.');

    // Two cases: the deep one and Login.md. Auth.md is NOT a case.
    expect(cases.map((c) => c.title).sort()).toEqual(['Deep case', 'Login case']);
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
    // The root workspace ('.') has no parent dir for a sibling note, so its metadata
    // (name/displayIdPrefix/description) lives in config.yaml itself.
    await fsp.writeFile(
      path.join(repoPath, '.casewright', 'config.yaml'),
      'version: 1\nname: Root WS\ndisplayIdPrefix: RT\nworkspaces:\n  - .\n',
    );
    await writeSmokeRun(repoPath, '2026-06-02-smoke');
    await fsp.writeFile(path.join(repoPath, 'CW-0002-root-case.md'), serializeCase(c2)); // case at the workspace root
    await fsp.mkdir(path.join(repoPath, 'Auth'), { recursive: true });
    await fsp.writeFile(path.join(repoPath, 'Auth', 'CW-0001-nested.md'), serializeCase(c1));

    await gitInit(repoPath);
  });

  afterAll(async () => {
    await node.fsp().rm(repoPath, { recursive: true, force: true });
  });

  it('declares a single workspace at path "" with metadata from config.yaml', async () => {
    const { workspaces, needsInit } = await openRepo(repoPath);
    expect(needsInit).toBe(false);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].path).toBe('');
    expect(workspaces[0].name).toBe('Root WS');
    expect(workspaces[0].prefix).toBe('RT');
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
    expect(runs[0].file).toBe('.casewright/runs/2026-06-02-smoke');
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

  it('reports an empty-repo warning when .casewright/ exists but no workspaces are listed', async () => {
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

// ---------------------------------------------------------------------------
// Suite-level prefix override carried onto the tree (inheritance source data)
// ---------------------------------------------------------------------------
describe('suite prefix override', () => {
  it('carries a suite folder note prefix onto its SuiteNode', async () => {
    const fsp = node.fsp();
    const path = node.path();
    const repoPath = await mkRepo('cw-prefix-');
    await fsp.mkdir(path.join(repoPath, '.casewright'), { recursive: true });
    await fsp.writeFile(path.join(repoPath, '.casewright', 'config.yaml'), 'version: 1\nworkspaces:\n  - areas/payments\n');
    const ws = path.join(repoPath, 'areas', 'payments');
    await fsp.mkdir(path.join(ws, 'Sessions'), { recursive: true });
    await fsp.writeFile(path.join(repoPath, 'areas', 'payments.md'), '---\nname: Payments\ndisplayIdPrefix: PAY\n---\n');
    await fsp.writeFile(path.join(ws, 'Sessions.md'), '---\nname: Sessions\ndisplayIdPrefix: SESS\n---\n');
    await fsp.writeFile(path.join(ws, 'Sessions', 'SESS-0001-x.md'), serializeCase({ ...c1, id: 'eee5555eeee', displayId: 'SESS-0001' }));
    await gitInit(repoPath);

    const { workspaces } = await openRepo(repoPath);
    const { tree } = await loadRepo(repoPath, workspaces);
    const wsNode = tree[0];
    expect(wsNode.type === 'suite' && wsNode.prefix).toBe('PAY'); // workspace root carries its prefix
    if (wsNode.type === 'suite') {
      const sessions = wsNode.children.find((n) => n.type === 'suite');
      expect(sessions && sessions.type === 'suite' && sessions.prefix).toBe('SESS'); // suite override
    }

    await fsp.rm(repoPath, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// Migration: legacy casewright.yaml/_suite.md → config + folder notes, space
// folders renamed to wiki-safe slugs; idempotent on re-open.
// ---------------------------------------------------------------------------
describe('migration (legacy → config + folder notes)', () => {
  const read = (p: string) => node.fsp().readFile(p, 'utf8');
  const exists = (p: string) =>
    node
      .fsp()
      .stat(p)
      .then(() => true)
      .catch(() => false);

  it('converts markers + _suite.md, renames space folders, and re-opens as a no-op', async () => {
    const fsp = node.fsp();
    const path = node.path();
    const repoPath = await mkRepo('cw-migrate-');
    await fsp.mkdir(path.join(repoPath, '.casewright'), { recursive: true });
    await fsp.writeFile(path.join(repoPath, '.casewright', 'config.yaml'), 'version: 1\n'); // no workspaces yet

    const ws = path.join(repoPath, 'areas', 'payments');
    await fsp.mkdir(path.join(ws, 'User Management'), { recursive: true }); // a space-named folder
    await fsp.mkdir(path.join(ws, 'Auth'), { recursive: true });
    await fsp.writeFile(path.join(ws, 'casewright.yaml'), 'name: Payments QA\ndisplayIdPrefix: PAY\ndescription: Billing.\n');
    await fsp.writeFile(path.join(ws, 'User Management', '_suite.md'), '---\ntitle: User Mgmt\ndescription: Manage users.\n---\n');
    await fsp.writeFile(path.join(ws, 'User Management', 'PAY-0001-x.md'), serializeCase({ ...c1, id: 'fff6666ffff', displayId: 'PAY-0001' }));
    await gitInit(repoPath);

    // First open migrates the repo.
    const opened = await openRepo(repoPath);
    expect(opened.workspaces.map((w) => w.path)).toEqual(['areas/payments']);
    expect(opened.workspaces[0]).toMatchObject({ name: 'Payments QA', prefix: 'PAY' });

    // config.yaml now lists the workspace; the workspace folder note was written.
    expect(await read(path.join(repoPath, '.casewright', 'config.yaml'))).toMatch(/workspaces:\n {2}- areas\/payments/);
    const wsNote = await read(path.join(repoPath, 'areas', 'payments.md'));
    expect(wsNote).toMatch(/name: Payments QA/);
    expect(wsNote).toMatch(/displayIdPrefix: PAY/);

    // The space-named folder was renamed; its note preserves the friendly display name.
    expect(await exists(path.join(ws, 'User Management'))).toBe(false);
    expect(await exists(path.join(ws, 'User-Management'))).toBe(true);
    expect(await read(path.join(ws, 'User-Management.md'))).toMatch(/name: User Mgmt/);

    // Legacy files are deleted once converted.
    expect(await exists(path.join(ws, 'casewright.yaml'))).toBe(false);
    expect(await exists(path.join(ws, 'User-Management', '_suite.md'))).toBe(false);

    // Loads correctly: the suite shows its display name and keeps its case.
    const { tree, cases } = await loadRepo(repoPath, opened.workspaces);
    const wsNode = tree[0];
    expect(wsNode.type === 'suite' && wsNode.children.some((n) => n.type === 'suite' && n.name === 'User Mgmt')).toBe(true);
    expect(cases.some((c) => c.displayId === 'PAY-0001')).toBe(true);

    // Re-opening is a no-op (no further 'migrated' warning).
    const again = await openRepo(repoPath);
    expect(again.warnings.some((w) => w.code === 'migrated')).toBe(false);

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

describe('reformatCaseFiles', () => {
  let dir: string;
  const rel = 'PAY-0003-repro.md';
  // A legacy file: 2-space nested step + an out-of-schema `## Notes` section to preserve.
  const legacy = `---
id: ccc3333cccc
displayId: PAY-0003
title: Repro
status: active
tags: []
---

## Objective

Do a thing.

## Systems in Scope

## Setup

## Steps

1. Outer step.
  1. Nested step.

## Acceptance Criteria

- It works.

## Notes

Out-of-schema content kept verbatim.
`;

  beforeAll(async () => {
    dir = await mkRepo('cw-reformat-');
    await writeFileAt(dir, rel, legacy);
  });
  afterAll(async () => {
    await node.fsp().rm(dir, { recursive: true, force: true });
  });

  it('reflows nested-list indentation to the target while preserving out-of-schema content', async () => {
    const changed = await reformatCaseFiles(dir, [rel], 'commonmark');
    expect(changed).toBe(1);
    const text = await node.fsp().readFile(node.path().join(dir, rel), 'utf8');
    expect(text).toContain('\n    1. Nested step.\n'); // 2-space → 4-space content-aligned
    expect(text).toContain('## Notes'); // extra preserved…
    expect(text).toContain('Out-of-schema content kept verbatim.'); // …verbatim
  });

  it('skips files already canonical for the target (idempotent)', async () => {
    expect(await reformatCaseFiles(dir, [rel], 'commonmark')).toBe(0);
  });
});
