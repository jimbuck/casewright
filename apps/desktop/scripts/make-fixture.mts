/**
 * Materialize the in-memory sample data (src/data/sample.ts) into a *real* Git
 * repository under apps/desktop/.fixture, using the same serializers the app uses.
 * This is the canonical dev/test target for the on-disk + Git backend.
 *
 * Layout (PRD §4): `.casewright/config.yaml` + `.casewright/.gitignore` + a flat
 * central `.casewright/runs/`, plus a `casewright.yaml` inside each workspace folder.
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

import { cases, runs, trees, workspaces } from '@/data/sample';
import { serializeCase } from '@/services/format/case';
import { CASEWRIGHT_GITIGNORE, serializeConfigYaml } from '@/services/format/config';
import { serializeRunCase, serializeRunDetails, type RunCaseItem } from '@/services/format/run';
import { serializeWorkspaceYaml } from '@/services/format/workspace';
import { caseFileName } from '@/services/format/filename';
import { deriveItems } from '@/utils/run-items';
import type { Case, RunRow, TreeNode } from '@/types';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '.fixture');
const withOrigin = process.argv.includes('--with-origin');

// --- clean slate ---
rmSync(repoRoot, { recursive: true, force: true });
mkdirSync(repoRoot, { recursive: true });

// --- .casewright/ scaffold (repo-wide config + central runs + gitignore) ---
const cwDir = join(repoRoot, '.casewright');
mkdirSync(join(cwDir, 'runs'), { recursive: true });
writeFileSync(join(cwDir, 'config.yaml'), serializeConfigYaml({ version: 1, name: 'Casewright Fixture' }));
writeFileSync(join(cwDir, '.gitignore'), CASEWRIGHT_GITIGNORE);

// --- one casewright.yaml + suite/case subtree per workspace ---
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
      const { suite: _s, modified: _m, ...parsed } = c as Case;
      writeFileSync(join(parentDir, caseFileName(c)), serializeCase(parsed));
    }
  }
}

for (const ws of workspaces) {
  const dir = join(repoRoot, ...ws.path.split('/'));
  mkdirSync(dir, { recursive: true });
  // Use the app's canonical serializer so the fixture round-trips (handles quoting).
  writeFileSync(join(dir, 'casewright.yaml'), serializeWorkspaceYaml(ws));
  walk(trees[ws.id] ?? [], dir);
}

// --- runs: one folder per run (_run.md + a sidecar per case) under .casewright/runs/ ---
const runsDir = join(cwDir, 'runs');
const overlay = (row: RunRow, key: string, text: string): RunCaseItem => ({
  key,
  text,
  state: row.checks[key] ?? 'none',
  failNote: row.failNotes[key] ?? '',
});
for (const run of runs) {
  const runFolder = run.file.split('/').pop() ?? 'run';
  const runDir = join(runsDir, runFolder);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    join(runDir, '_run.md'),
    serializeRunDetails({
      name: run.name,
      status: run.status,
      created: run.created,
      scope: run.scope,
      testerApproval: run.testerApproval,
      reviewerApproval: run.reviewerApproval,
      summary: run.summary,
      notes: run.notes,
    }),
  );
  for (const row of run.rows) {
    const kase = byId.get(row.case_id);
    const d = deriveItems(kase);
    writeFileSync(
      join(runDir, row.file.split('/').pop() ?? 'case.md'),
      serializeRunCase({
        caseId: row.case_id,
        displayId: row.display_id,
        title: row.title,
        result: row.result,
        tester: row.tester,
        executedAt: row.executed_at,
        notes: row.notes,
        setup: d.setup.map((it) => overlay(row, it.key, it.text)),
        steps: d.steps.map((it) => overlay(row, it.key, it.text)),
        accept: d.accept.map((it) => overlay(row, it.key, it.text)),
      }),
    );
  }
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

const fileCount = cases.length + runs.length * 2 + workspaces.length + 2;
console.log(`Fixture written to ${repoRoot} (~${fileCount} files, ${cases.length} cases, ${runs.length} runs, ${workspaces.length} workspaces).`);
