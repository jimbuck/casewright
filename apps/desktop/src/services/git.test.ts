import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { node } from '@/lib/node';
import { abortMerge, pull, push, stageAndCommit, status } from './git';

let tmp: string;
let repo: string;
let origin: string;
let clone: string;

const write = (dir: string, name: string, content: string) =>
  node.fsp().writeFile(node.path().join(dir, name), content);
const read = (dir: string, name: string) => node.fsp().readFile(node.path().join(dir, name), 'utf8');

async function configure(dir: string, email: string, name: string) {
  const g = node.simpleGit()(dir);
  await g.addConfig('user.email', email, false, 'local');
  await g.addConfig('user.name', name, false, 'local');
  await g.addConfig('core.autocrlf', 'false', false, 'local'); // keep test content byte-exact
}

beforeAll(async () => {
  const fsp = node.fsp();
  const path = node.path();
  tmp = await fsp.mkdtemp(path.join(node.os().tmpdir(), 'cw-git-'));
  repo = path.join(tmp, 'repo');
  origin = path.join(tmp, 'origin.git');
  clone = path.join(tmp, 'clone');

  await fsp.mkdir(repo, { recursive: true });
  const g = node.simpleGit()(repo);
  await g.init();
  await configure(repo, 'dev@cw.dev', 'Dev');
  await write(repo, 'a.md', 'one\n');
  await g.add('.');
  await g.commit('init');
  await g.branch(['-M', 'main']);

  await fsp.mkdir(origin, { recursive: true });
  await node.simpleGit()(origin).init(true);
  await g.addRemote('origin', origin);
  await g.push(['-u', 'origin', 'main']);
});

afterAll(async () => {
  await node.fsp().rm(tmp, { recursive: true, force: true });
});

describe('git service', () => {
  it('reports a clean tree on main', async () => {
    const s = await status(repo);
    expect(s.branch).toBe('main');
    expect(s.changes).toHaveLength(0);
    expect(s.ahead).toBe(0);
  });

  it('detects a modification, commits it, and pushes', async () => {
    await write(repo, 'a.md', 'two\n');
    let s = await status(repo);
    expect(s.changes.map((c) => c.status)).toContain('M');

    await stageAndCommit(repo, ['a.md'], 'update a');
    s = await status(repo);
    expect(s.changes).toHaveLength(0);
    expect(s.ahead).toBe(1);

    await push(repo);
    s = await status(repo);
    expect(s.ahead).toBe(0);
  });

  it('pulls a divergent upstream change (clean merge)', async () => {
    await node.simpleGit()().clone(origin, clone);
    await configure(clone, 'other@cw.dev', 'Other');
    await write(clone, 'b.md', 'beta\n');
    const gc = node.simpleGit()(clone);
    await gc.add('.');
    await gc.commit('add b');
    await gc.push();

    const res = await pull(repo);
    expect(res.ok).toBe(true);
    expect(await read(repo, 'b.md')).toBe('beta\n');
  });

  it('surfaces conflicts on a divergent same-file pull and aborts cleanly', async () => {
    // local commit (not pushed)
    await write(repo, 'a.md', 'local change\n');
    await stageAndCommit(repo, ['a.md'], 'local edit');

    // a competing upstream commit to the same file
    const gc = node.simpleGit()(clone);
    await gc.pull();
    await write(clone, 'a.md', 'remote change\n');
    await gc.add('.');
    await gc.commit('remote edit');
    await gc.push();

    const res = await pull(repo);
    expect(res.ok).toBe(false);
    expect(res.conflicted).toContain('a.md');

    await abortMerge(repo);
    expect((await status(repo)).conflicted).toHaveLength(0);
  });
});
