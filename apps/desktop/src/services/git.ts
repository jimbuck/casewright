import { node } from '@/lib/node';
import type { Change, ChangeStatus } from '@/types';

/** Auth uses the system Git credential helper (PRD §6.6); the app stores no secrets. */
export class GitAuthError extends Error {
  constructor(message = 'Git authentication failed — check your system credential helper.') {
    super(message);
    this.name = 'GitAuthError';
  }
}

function git(repoPath: string) {
  return node.simpleGit()(repoPath);
}

const AUTH_RE = /authentication failed|could not read (username|password)|permission denied|access denied|terminal prompts disabled|invalid credentials|403|fatal: could not read/i;

function wrapAuth(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (AUTH_RE.test(msg)) throw new GitAuthError();
  throw err instanceof Error ? err : new Error(msg);
}

function fileStatus(index: string, working: string): ChangeStatus {
  if (index === 'D' || working === 'D') return 'D';
  if (index === 'A' || index === '?' || working === '?') return 'A';
  return 'M';
}

function changeKind(path: string): 'case' | 'run' {
  return path.endsWith('.csv') || /\/runs\//.test(path) ? 'run' : 'case';
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  changes: Change[];
  conflicted: string[];
}

/** Read working-tree + upstream state and map porcelain entries to `Change[]`. */
export async function status(repoPath: string): Promise<GitStatus> {
  const s = await git(repoPath).status();
  const changes: Change[] = s.files.map((f) => ({
    kind: changeKind(f.path),
    refId: f.path,
    path: f.path,
    status: fileStatus(f.index, f.working_dir),
    label: f.path.split('/').pop() ?? f.path,
  }));
  return {
    branch: s.current ?? 'main',
    ahead: s.ahead,
    behind: s.behind,
    changes,
    conflicted: s.conflicted,
  };
}

/** Stage the given repo-relative paths (or everything) and commit. */
export async function stageAndCommit(repoPath: string, paths: string[], message: string): Promise<void> {
  const g = git(repoPath);
  await g.add(paths.length ? paths : '.');
  await g.commit(message);
}

export async function push(repoPath: string): Promise<void> {
  try {
    await git(repoPath).push();
  } catch (e) {
    wrapAuth(e);
  }
}

export interface PullResult {
  ok: boolean;
  conflicted: string[];
}

/** Fetch + merge. Returns `{ ok:false, conflicted }` on merge conflicts (rather than throwing). */
export async function pull(repoPath: string): Promise<PullResult> {
  try {
    await git(repoPath).pull();
    return { ok: true, conflicted: [] };
  } catch (e) {
    const conflicted = (await git(repoPath).status()).conflicted;
    if (conflicted.length) return { ok: false, conflicted };
    wrapAuth(e);
  }
}

export async function conflictedFiles(repoPath: string): Promise<string[]> {
  return (await git(repoPath).status()).conflicted;
}

/** Read a merge stage (1=base, 2=ours, 3=theirs) of a path — for the deferred merge engine. */
export async function readStage(repoPath: string, stage: 1 | 2 | 3, path: string): Promise<string> {
  return git(repoPath).show([`:${stage}:${path}`]);
}

/** Commit the resolved merge. */
export async function completeMerge(repoPath: string, message: string): Promise<void> {
  const g = git(repoPath);
  await g.add('.');
  await g.commit(message);
}

/** Abort an in-progress merge, restoring a clean tree. */
export async function abortMerge(repoPath: string): Promise<void> {
  await git(repoPath).raw(['merge', '--abort']);
}
