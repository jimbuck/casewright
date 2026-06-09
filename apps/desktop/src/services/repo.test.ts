import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { node } from '@/lib/node';
import { parseCase, serializeCase, type ParsedCase } from './format/case';
import { serializeRunCsv } from './format/run';
import { deletePath, loadWorkspace, makeDir, openRepo, renamePath, writeFileAt } from './repo';

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
    const { loadRepo } = await import('./repo');
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
