/**
 * Materialize the in-memory sample data (src/data/sample.ts) into a *real* Git
 * repository under apps/desktop/.fixture, using the same serializers the app uses.
 * This is the canonical dev/test target for the on-disk + Git backend.
 *
 * Run via `pnpm --filter @casewright/desktop fixture` (uses vite-node so the `@`
 * alias + TS resolve). Pass `--with-origin` to also create a bare `.fixture-origin.git`
 * remote and push to it (for the Git-loop tests).
 */
import { createRequire } from 'node:module';
// The format layer pulls gray-matter / papaparse through the node bridge.
(globalThis as { require?: NodeRequire }).require ??= createRequire(import.meta.url);

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simpleGit } from 'simple-git';

import { cases, rootConfig, runs, tree, workspaces } from '@/data/sample';
import { serializeCase } from '@/services/format/case';
import { serializeRunCsv, serializeRunSidecar } from '@/services/format/run';
import { caseFileName } from '@/services/format/filename';
import type { TreeNode } from '@/types';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '.fixture');
const withOrigin = process.argv.includes('--with-origin');

// --- clean slate ---
rmSync(repoRoot, { recursive: true, force: true });
mkdirSync(repoRoot, { recursive: true });

// --- root config ---
writeFileSync(join(repoRoot, 'casewright.json'), JSON.stringify(rootConfig, null, 2) + '\n');

// --- one workspace.yaml per declared workspace ---
for (const ws of workspaces) {
  const dir = join(repoRoot, ...ws.path.split('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'workspace.yaml'),
    `name: ${ws.name}\ndescription: ${ws.description}\ndisplayIdPrefix: ${ws.prefix}\nrunsDir: ${ws.runsDir}\n`,
  );
}

// --- the active workspace (Payments QA) holds the sample suite/case tree ---
const active = workspaces[0];
const wsRoot = join(repoRoot, ...active.path.split('/'));
const byId = new Map(cases.map((c) => [c.id, c]));

function walk(nodes: TreeNode[], parentDir: string) {
  for (const n of nodes) {
    if (n.type === 'suite') {
      const dir = join(parentDir, n.name);
      mkdirSync(dir, { recursive: true });
      walk(n.children, dir);
    } else {
      const c = byId.get(n.id);
      if (!c) continue;
      const { suite: _s, modified: _m, ...parsed } = c;
      writeFileSync(join(parentDir, caseFileName(c)), serializeCase(parsed));
    }
  }
}
walk(tree, wsRoot);

// --- runs (CSV + sidecar) under the workspace runs dir ---
const runsDir = join(wsRoot, active.runsDir);
mkdirSync(runsDir, { recursive: true });
for (const run of runs) {
  const csvName = run.file.split('/').pop() ?? 'run.csv';
  writeFileSync(join(runsDir, csvName), serializeRunCsv(run.rows));
  writeFileSync(join(runsDir, csvName.replace(/\.csv$/, '.md')), serializeRunSidecar({ name: run.name, status: run.status }));
}

// --- git init + seed commit on `main` ---
const git = simpleGit(repoRoot);
await git.init();
await git.addConfig('user.email', 'fixture@casewright.dev', false, 'local');
await git.addConfig('user.name', 'Casewright Fixture', false, 'local');
await git.add('.');
await git.commit('Seed Casewright fixture repository');
await git.branch(['-M', 'main']);

if (withOrigin) {
  const originDir = join(here, '..', '.fixture-origin.git');
  rmSync(originDir, { recursive: true, force: true });
  mkdirSync(originDir, { recursive: true });
  await simpleGit(originDir).init(true); // bare
  await git.addRemote('origin', originDir);
  await git.push(['-u', 'origin', 'main']);
  console.log('Bare origin:', originDir);
}

const fileCount = cases.length + runs.length * 2 + workspaces.length + 1;
console.log(`Fixture written to ${repoRoot} (~${fileCount} files, ${cases.length} cases, ${runs.length} runs).`);
