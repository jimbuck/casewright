import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { node } from '@/lib/node';
import { parseCase, serializeCase, type ParsedCase } from './format/case';
import { serializeRunCsv } from './format/run';
import { deletePath, loadRepo, loadWorkspace, makeDir, openRepo, relJoin, renamePath, writeFileAt } from './repo';

let repoPath: string;

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

beforeAll(async () => {
  const fsp = node.fsp();
  const path = node.path();
  const os = node.os();
  repoPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'cw-repo-'));

  await fsp.writeFile(path.join(repoPath, 'casewright.json'), JSON.stringify({ workspaces: ['areas/*'] }, null, 2));

  const ws = path.join(repoPath, 'areas', 'payments');
  await fsp.mkdir(path.join(ws, 'Auth', 'Sessions'), { recursive: true });
  await fsp.writeFile(path.join(ws, 'workspace.yaml'), 'name: Payments QA\ndisplayIdPrefix: PAY\nrunsDir: runs\n');
  await fsp.writeFile(path.join(ws, 'Auth', 'PAY-0001-first-case.md'), serializeCase(c1));
  await fsp.writeFile(path.join(ws, 'Auth', 'Sessions', 'PAY-0002-nested-case.md'), serializeCase(c2));
  await fsp.mkdir(path.join(ws, 'runs'), { recursive: true });
  await fsp.writeFile(
    path.join(ws, 'runs', '2026-06-01-smoke.csv'),
    serializeRunCsv([
      { case_id: 'aaa1111aaaa', display_id: 'PAY-0001', title: 'First case', result: 'pass', tester: 'me', executed_at: '2026-06-01 09:00', notes: '' },
    ]),
  );

  const git = node.simpleGit()(repoPath);
  await git.init();
  await git.addConfig('user.email', 'test@casewright.dev', false, 'local');
  await git.addConfig('user.name', 'Test', false, 'local');
  await git.add('.');
  await git.commit('seed');
  await git.branch(['-M', 'main']);
});

afterAll(async () => {
  await node.fsp().rm(repoPath, { recursive: true, force: true });
});

describe('openRepo', () => {
  it('validates the worktree and resolves workspaces from casewright.json', async () => {
    const { workspaces, branch, warnings } = await openRepo(repoPath);
    expect(branch).toBe('main');
    expect(warnings).toHaveLength(0);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]).toMatchObject({ name: 'Payments QA', prefix: 'PAY', path: 'areas/payments', runsDir: 'runs' });
  });

  it('throws for a non-repo path', async () => {
    const tmp = await node.fsp().mkdtemp(node.path().join(node.os().tmpdir(), 'cw-norepo-'));
    await expect(openRepo(tmp)).rejects.toThrow(/Not a Git repository/);
    await node.fsp().rm(tmp, { recursive: true, force: true });
  });
});

describe('loadWorkspace', () => {
  it('builds the tree, cases, and runs from disk', async () => {
    const { workspaces } = await openRepo(repoPath);
    const { tree, cases, runs, warnings } = await loadWorkspace(repoPath, workspaces[0]);

    expect(warnings).toHaveLength(0);
    expect(cases.map((c) => c.displayId).sort()).toEqual(['PAY-0001', 'PAY-0002']);

    const first = cases.find((c) => c.displayId === 'PAY-0001')!;
    expect(first.steps).toEqual(c1.steps);
    expect(first.systems).toEqual(c1.systems);
    expect(first.modified).toBe(false);

    // tree: an Auth suite containing a case + a nested Sessions suite
    expect(tree).toHaveLength(1);
    const auth = tree[0];
    expect(auth.type).toBe('suite');
    if (auth.type === 'suite') {
      expect(auth.name).toBe('Auth');
      expect(auth.children.some((n) => n.type === 'case')).toBe(true);
      expect(auth.children.some((n) => n.type === 'suite' && n.name === 'Sessions')).toBe(true);
    }

    expect(runs).toHaveLength(1);
    expect(runs[0].rows[0].result).toBe('pass');
    expect(runs[0].file).toBe('areas/payments/runs/2026-06-01-smoke.csv');
  });

  it('loadRepo combines workspaces as top-level folders', async () => {
    const { workspaces } = await openRepo(repoPath);
    const { tree, cases } = await loadRepo(repoPath, workspaces);
    expect(tree).toHaveLength(1);
    expect(tree[0].type).toBe('suite');
    if (tree[0].type === 'suite') {
      expect(tree[0].isWorkspace).toBe(true);
      expect(tree[0].name).toBe('Payments QA');
      expect(tree[0].path).toBe('areas/payments');
    }
    expect(cases).toHaveLength(2);
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

describe('root (implicit) workspace normalization', () => {
  let rootRepo: string;

  beforeAll(async () => {
    const fsp = node.fsp();
    const path = node.path();
    const os = node.os();
    rootRepo = await fsp.mkdtemp(path.join(os.tmpdir(), 'cw-root-'));
    // No casewright.json and no workspace.yaml → implicit single workspace at the repo root.
    await fsp.writeFile(path.join(rootRepo, 'CW-0002-root-case.md'), serializeCase(c2)); // case at the workspace root
    await fsp.mkdir(path.join(rootRepo, 'Auth'), { recursive: true });
    await fsp.writeFile(path.join(rootRepo, 'Auth', 'CW-0001-nested.md'), serializeCase(c1));
    await fsp.mkdir(path.join(rootRepo, 'runs'), { recursive: true });
    await fsp.writeFile(
      path.join(rootRepo, 'runs', '2026-06-02-smoke.csv'),
      serializeRunCsv([
        { case_id: 'aaa1111aaaa', display_id: 'PAY-0001', title: 'First case', result: 'pass', tester: 'me', executed_at: '2026-06-02 09:00', notes: '' },
      ]),
    );
    const git = node.simpleGit()(rootRepo);
    await git.init();
    await git.addConfig('user.email', 'test@casewright.dev', false, 'local');
    await git.addConfig('user.name', 'Test', false, 'local');
    await git.add('.');
    await git.commit('seed');
    await git.branch(['-M', 'main']);
  });

  afterAll(async () => {
    await node.fsp().rm(rootRepo, { recursive: true, force: true });
  });

  it('treats the repo root as a single workspace with path ""', async () => {
    const { workspaces, warnings } = await openRepo(rootRepo);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].path).toBe('');
    expect(workspaces[0].id).not.toBe('');
    expect(warnings.some((w) => w.code === 'no-config')).toBe(true);
  });

  it('emits non-empty suite ids and no "./"-prefixed paths (Copilot #1–#3)', async () => {
    const { workspaces } = await openRepo(rootRepo);
    const ws = workspaces[0];
    const { tree, cases, runs } = await loadRepo(rootRepo, workspaces);

    // workspace wrapper node id matches the (non-empty) workspace id
    expect(tree).toHaveLength(1);
    const wsNode = tree[0];
    expect(wsNode.type === 'suite' && wsNode.id).toBe(ws.id);
    expect(ws.id).not.toBe('');

    // a nested suite's path is "Auth", not "./Auth"
    if (wsNode.type === 'suite') {
      const auth = wsNode.children.find((n) => n.type === 'suite');
      expect(auth && auth.type === 'suite' && auth.path).toBe('Auth');
    }

    // the root-level case belongs to the (non-empty) workspace-root suite id
    const rootCase = cases.find((c) => c.id === c2.id)!;
    expect(rootCase.suite).toBe(ws.id);
    expect(rootCase.suite).not.toBe('');

    // run file/id carry no "./" prefix
    expect(runs).toHaveLength(1);
    expect(runs[0].file).toBe('runs/2026-06-02-smoke.csv');
    expect(runs[0].id).toBe('runs/2026-06-02-smoke');
    expect(runs[0].file.startsWith('./')).toBe(false);
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
    dir = await node.fsp().mkdtemp(node.path().join(node.os().tmpdir(), 'cw-write-'));
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
    await makeDir(dir, 'areas/payments/runs');
    expect(await exists('areas/payments/runs')).toBe(true);
    await deletePath(dir, 'areas/payments/Billing/PAY-0001-first.md');
    expect(await exists('areas/payments/Billing/PAY-0001-first.md')).toBe(false);
  });
});
