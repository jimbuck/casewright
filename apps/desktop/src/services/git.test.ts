import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { node } from '@/lib/node';
import { abortMerge, fetch, pull, push, stageAndCommit, status } from './git';

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
  await g.addConfig('commit.gpgsign', 'false', false, 'local'); // don't inherit ambient signing config
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
  // Create the bare origin with HEAD -> main. Without an explicit initial branch the
  // bare repo inherits git's `init.defaultBranch` (often `master` on CI runners), so its
  // HEAD points at a ref that never gets pushed — the later `clone` then checks out an
  // empty tree and the divergent-pull tests fail. Pinning it to `main` keeps CI in sync.
  await node.simpleGit()(origin).init(true, ['-b', 'main']);
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

  it('fetch surfaces commits-behind without merging', async () => {
    const fsp = node.fsp();
    const path = node.path();
    const o = path.join(tmp, 'fetch-origin.git');
    const a = path.join(tmp, 'fetch-a');
    const b = path.join(tmp, 'fetch-b');

    // a bare origin seeded from clone `a`
    await fsp.mkdir(o, { recursive: true });
    await node.simpleGit()(o).init(true, ['-b', 'main']);
    await fsp.mkdir(a, { recursive: true });
    const ga = node.simpleGit()(a);
    await ga.init();
    await configure(a, 'a@cw.dev', 'A');
    await write(a, 'x.md', '1\n');
    await ga.add('.');
    await ga.commit('init');
    await ga.branch(['-M', 'main']);
    await ga.addRemote('origin', o);
    await ga.push(['-u', 'origin', 'main']);

    // a second clone `b` pushes a new upstream commit
    await node.simpleGit()().clone(o, b);
    await configure(b, 'b@cw.dev', 'B');
    const gb = node.simpleGit()(b);
    await write(b, 'x.md', '2\n');
    await gb.add('.');
    await gb.commit('upstream change');
    await gb.push();

    // a's stale remote-tracking ref → status sees nothing behind yet
    expect((await status(a)).behind).toBe(0);

    // fetch refreshes the ref → status now reports 1 behind, and the working tree is untouched
    await fetch(a);
    expect((await status(a)).behind).toBe(1);
    expect(await read(a, 'x.md')).toBe('1\n');
  }, 20_000); // spins up its own origin + two clones — slower than the shared-repo cases
});
