# `.casewright/` Config Model & Self-Declaring Workspaces - Implementation Tasks

## Overview

Replace the hand-maintained workspace registry (root `casewright.json` globs + per-workspace
`workspace.yaml` + per-workspace `runs/`) with:

1. A **`.casewright/` folder at the repo root** holding `config.yaml`, a centralized flat `runs/`
   directory, an auto-managed `.gitignore`, and reserved room for `cache/`.
2. A **`casewright.yaml` inside each workspace folder** whose mere presence declares that folder a
   workspace, discovered by a **one-time walk** on repo open (no central registry).

Runs become **repo-level** (a single run may span workspaces); the JSON root config is replaced by
YAML; legacy formats are dropped outright (hard cutover, no migration). See
`.docs/casewright-config-model/prd.md` for the full requirements (FR 1–23).

## Tasks

### [x] 0100 - Schemas & domain types for the `.casewright/` model

**Overview:** Lay the type/schema foundation the rest of the work compiles against: a new
`.casewright/config.yaml` schema (replacing the JSON `RootConfigSchema`), a tightened
`casewright.yaml` schema (required `name`/`displayIdPrefix`, no `runsDir`), and domain-type updates
(drop `Workspace.runsDir`, make `Run.file`/`Run.id` repo-level, broaden `RunScope`). Parsing stays
tolerant (coerce + `LintWarning`, never throw). (PRD FR 3, 12, 13, 16–20.)

**Relevant Files:**
- `apps/desktop/src/schemas/config.ts` - Replace `RootConfigSchema` (`{ workspaces }`) with the `.casewright/config.yaml` schema (`{ version: int, name?: string }`, unknown keys preserved).
- `apps/desktop/src/schemas/workspace.ts` - `name` + `displayIdPrefix` coerced-not-rejected (blank → defaulted + warned at the service), `description` optional, remove `runsDir`.
- `apps/desktop/src/schemas/index.ts` - Re-export surface for the renamed/added config schema.
- `apps/desktop/src/types/index.ts` - Drop `Workspace.runsDir`; document `Run.file`/`Run.id` as `.casewright/runs/<stem>`; broaden `RunScope` to `'all' | 'workspace' | 'suite' | 'tag'` and update `CreateRunArgs`.

**Sub-Tasks:**
- [x] 0101 In `schemas/config.ts`, replace `RootConfigSchema` with a `ConfigYamlSchema` for `.casewright/config.yaml`: `version` (int, `.default(1)`), optional `name` (string); use `z.looseObject` so unknown keys are preserved (FR 3). Export the schema and its inferred type; remove `RootConfig`.
- [x] 0102 In `schemas/workspace.ts`, rename/retarget to `casewright.yaml`: keep `name` and `displayIdPrefix` as `.default('')` (so a malformed/blank file coerces rather than throws — the service adds the lint warning, FR 13), keep `description` optional, and **remove `runsDir`** (FR 12).
- [x] 0103 Update `schemas/index.ts`: drop the `RootConfigSchema`/`RootConfig` exports, add the new config schema + type, keep `WorkspaceYamlSchema`/`LintWarning` exports.
- [x] 0104 In `types/index.ts`, remove `runsDir` from `Workspace`; update the `Run.file`/`Run.id` doc comments to `.casewright/runs/<stem>`; broaden `RunScope` to `'all' | 'workspace' | 'suite' | 'tag'` and ensure `CreateRunArgs` still type-checks against the new union.

**Notes:**
- This is the breaking change at the root of the dependency graph: removing `Workspace.runsDir` and
  changing `RunScope` ripples into the repo service, store, components, fixture, and tests (tasks
  0200–0600). Expect typecheck to stay red until those consumers are updated.
- "Required" `name`/`displayIdPrefix` is enforced at the **UI save** layer (0401), not by Zod —
  Zod stays tolerant so a bad file still opens (FR 13).

---

### [ ] 0200 - Repo service: `.casewright/` validation, discovery walk, scaffold & central runs

**Overview:** Rewrite the read path in `repo.ts`. `openRepo` validates both a Git worktree **and** a
`.casewright/` directory, then discovers workspaces by a one-time walk for `casewright.yaml` markers
(skipping `.git`/`.casewright`/dot-folders, no nesting, root-as-single-workspace short-circuit,
alphabetical-by-name order, empty-repo state when no markers). Runs load once from
`.casewright/runs/` at the repo level. Add an `initRepo` scaffold helper plus the config/gitignore
serializers. (PRD FR 1, 2, 4, 5, 6–11, 14, 16, 20.)

**Relevant Files:**
- `apps/desktop/src/services/repo.ts` - Rewrite `openRepo` + discovery; `loadWorkspaceMeta` reads `casewright.yaml`; repo-level `loadRuns`; add `initRepo` scaffold helper.
- `apps/desktop/src/services/format/workspace.ts` - `serializeWorkspaceYaml` drops `runsDir`.
- `apps/desktop/src/services/format/config.ts` - New: `serializeConfigYaml` + canonical `.casewright/.gitignore` contents.
- `apps/desktop/src/lib/node.ts` - Verify the YAML/`gray-matter` bridge handles the config doc (no change expected).

**Sub-Tasks:**
- [ ] 0201 Add `services/format/config.ts`: `serializeConfigYaml({ version, name? })` (reuse the `yamlScalar` quoting pattern from `format/workspace.ts`) and a `CASEWRIGHT_GITIGNORE` constant whose body ignores `cache/` (FR 4, 5). Optionally a small `parseConfigYaml(raw)` wrapper over `parseYamlDoc`.
- [ ] 0202 In `format/workspace.ts`, change `serializeWorkspaceYaml` to `Pick<Workspace,'name'|'description'|'prefix'>` and drop the `runsDir` line (FR 12).
- [ ] 0203 In `repo.ts`, rewrite `openRepo` validation: require a Git worktree **and** a `.casewright/` directory; when `.casewright/` is absent emit a `needs-init` warning (don't throw, FR 1–2); read+validate `.casewright/config.yaml` tolerantly via `ConfigYamlSchema` (malformed → defaults + warning, FR 3).
- [ ] 0204 Replace `resolveWorkspacePaths` with a `discoverWorkspaces(repoPath)` walk: recurse from root, **skip** `.git`/`.casewright`/any dot-folder; a folder containing `casewright.yaml` is a workspace and the walk **does not descend** into it (FR 7, 8); short-circuit root-as-workspace when `<root>/casewright.yaml` exists (single workspace at `''`, FR 9); sort results alphabetically by display name, tie-break by path (FR 10); emit an empty-repo warning when no markers are found (FR 11).
- [ ] 0205 Update `loadWorkspaceMeta` to read `casewright.yaml` (not `workspace.yaml`): coerce blank `name` → folder name and blank `displayIdPrefix` → a derived placeholder, each with a `LintWarning` (FR 13); drop `runsDir`. After discovery, emit a warning for any duplicated `displayIdPrefix` across workspaces (load anyway, FR 14).
- [ ] 0206 Centralize runs: make `loadRuns` workspace-agnostic — read `.casewright/runs/` once at the repo level with `file`/`id` = `.casewright/runs/<stem>` (FR 16, 20); remove runs from `loadWorkspace` (and its per-workspace `runsDir` skip in the walk); call repo-level `loadRuns` from `loadRepo`. Adjust `LoadedWorkspace`/return shapes accordingly.
- [ ] 0207 Add `initRepo(repoPath)` scaffold helper: write `.casewright/config.yaml` (via `serializeConfigYaml`), create `.casewright/runs/` (seed a `.gitkeep` so the empty dir is tracked), and write `.casewright/.gitignore` (FR 2, 4). Return enough for the store to re-open the now-initialized repo.

**Notes:**
- Depends on 0100. The discovery walk fully replaces glob resolution — no `casewright.json` is read
  anywhere after this task. `OpenedRepo.warnings` carries the `needs-init` / empty-repo signals the
  UI (0400) consumes. Re-derive a workspace's `id` from its path the same normalized way as today
  (`relJoin`/`slug`, repo-root → `''`).

---

### [ ] 0300 - Store rewiring: repo-level runs, scope-based create, `casewright.yaml` writes, init action

**Overview:** Update `app-store.ts` so run paths target `.casewright/runs/`, `createRun` seeds rows
by Repo / Workspace / Suite scope across **all** workspaces, `updateWorkspace` writes
`<workspace>/casewright.yaml` (dropping all `runsDir` logic), a `case → workspace` lookup buckets
run rows by workspace for summaries, and a new scaffold/init action writes `.casewright/` for an
un-initialized repo. (PRD FR 15, 17–21, 2.)

**Relevant Files:**
- `apps/desktop/src/store/app-store.ts` - Run paths, scope-based seeding, `casewright.yaml` writes, `caseWorkspace` lookup, `initRepo` action + needs-init/empty wiring.
- `apps/desktop/src/services/recents.ts` - Verify recents still records `workspaces`/`lastWorkspaceId` (no schema change expected).

**Sub-Tasks:**
- [ ] 0301 Repoint run paths to `.casewright/runs/`: in `createRun`, build `file = '.casewright/runs/' + stem + '.csv'` (+ matching `.md` sidecar) and `id` from the stem; `runRel` returns `run.file` unchanged; delete all `relJoin(workspace.path, workspace.runsDir, …)` usage (FR 16, 20).
- [ ] 0302 Make `createRun` scope-based across the whole repo: `'all'` → every case in the repo; `'workspace'` → cases in the active workspace; `'suite'` → the suite subtree (`casesInSuite`); `'tag'` → cases carrying the tag (repo-wide). Record a human-readable `scope` label (e.g. `"workspace: Payments QA"`). Drop the old `workspace`-gated `inWs` filter (FR 17, 19).
- [ ] 0303 In `updateWorkspace`, write `<workspace>/casewright.yaml` (rename `writeWsYaml`'s target from `workspace.yaml`) and **remove** the entire `runsDir` rename branch + any `next.runsDir` references (FR 15).
- [ ] 0304 Add a `caseWorkspace(caseId)` helper (resolve a case → its suite path → owning `Workspace` via `workspaceOfPath`) and expose it for summaries; this is the read-time owning-workspace derivation (FR 18) that replaces file-path-prefix bucketing.
- [ ] 0305 Add an `initRepo` store action that calls the service scaffold (0207) then loads the repo, plus state flags (e.g. `needsInit: boolean`) set from the service warnings so the UI can branch (FR 2).
- [ ] 0306 Update the `openRepo` action to consume the `needs-init` / empty-repo warnings without crashing: set the flags, keep `screen`/`workspace` in a safe state, and surface a toast/banner instead of opening a broken workbench (FR 1, 11).

**Notes:**
- Depends on 0100 + 0200. The `caseWorkspace` lookup is reused by the summary pages (0402, FR 18,
  21). Keep the optimistic-write-then-reconcile pattern intact when repointing run writes.

---

### [ ] 0400 - UI: workspace settings, create-run scope, empty-repo & init flows

**Overview:** Surface the new model in the UI: the workspace settings panel drops *Runs directory*,
enforces non-blank *Name*/*Display ID prefix*, and shows the `<workspace>/casewright.yaml` path;
summary run stats filter by **case membership** (not file-path prefix); the create-run modal offers
Repo / Workspace / Suite scope; and new launcher/center states cover an empty repo (no markers) and
the `.casewright/` init/scaffold flow. (PRD FR 2, 11, 15, 19, 21.)

**Relevant Files:**
- `apps/desktop/src/components/summary/SuiteSummary.tsx` - `WorkspaceSettings` + run-membership filtering.
- `apps/desktop/src/components/runs/CreateRunModal.tsx` - Repo / Workspace / Suite scope.
- `apps/desktop/src/components/launcher/Launcher.tsx` - Empty-repo + init entry points.
- `apps/desktop/src/components/App.tsx` - Center/empty gating for empty/un-initialized repos.
- `apps/desktop/src/components/runs/RunsList.tsx` - Runs-dir chip now reflects the central `.casewright/runs/`.

**Sub-Tasks:**
- [ ] 0401 In `WorkspaceSettings` (`SuiteSummary.tsx`): remove the *Runs directory* `Field`, its `runsDir` state and `useEffect` deps; change the path label to `{ws.path}/casewright.yaml`; enforce non-blank on blur for *Name* and *Display ID prefix* (skip the commit + keep the prior value when trimmed-empty, FR 15); update the helper text to drop the runs-dir sentence.
- [ ] 0402 In `SuiteSummary`, replace the `relevantRuns` filter and `runTally` id-set with the `caseWorkspace`/case-membership derivation: a workspace summary shows runs with ≥1 row whose case belongs to that workspace; a suite summary shows runs touching the suite subtree — no `r.file.startsWith(ws.path + '/')` (FR 18, 21).
- [ ] 0403 In `CreateRunModal`: replace the scope options with **Whole repo** (`'all'`), **This workspace** (`'workspace'`), **By suite** (`'suite'`), and keep **By tag** (`'tag'`); update default scope, the seeded-row `count` preview per scope, and the copy referencing "this workspace" (FR 19).
- [ ] 0404 In `Launcher.tsx`: add an **empty-repo** state (opened a `.casewright/` repo with zero workspaces → invite to create the first workspace) and an **init** entry (opened a Git repo without `.casewright/` → offer to scaffold it via the store `initRepo` action), styled like the existing dashed-empty / banner treatments (FR 2, 11).
- [ ] 0405 In `App.tsx`: gate the workbench on the new flags — route an un-initialized or empty repo to the launcher/init/empty states instead of a broken `Center`, consistent with the `mergeBanner` styling (FR 2, 11).
- [ ] 0406 In `RunsList.tsx`, replace the `ctx.workspace?.runsDir ?? 'runs'` chip with the central `.casewright/runs` label (runs are repo-level, not per-workspace).

**Notes:**
- Depends on 0300 (init action, `caseWorkspace`, scope-based create). Keep the existing
  colorblind-safe palette and summary layout — this changes *where data lives*, not the visuals.

---

### [ ] 0500 - Fixture & sample data regeneration to the new layout

**Overview:** Regenerate the dev/test fixture and the in-memory seed to the new layout:
`.casewright/config.yaml`, `.casewright/runs/` (flat, central), `.casewright/.gitignore`, and a
per-workspace `casewright.yaml`; remove the root `casewright.json` glob list and all `runsDir`
usage; rewrite run file paths to `.casewright/runs/<stem>`; spread cases across ≥2 workspaces so a
cross-workspace run is demonstrable. (PRD FR 22, 23; §8.)

**Relevant Files:**
- `apps/desktop/src/data/sample.ts` - Drop `rootConfig` + `runsDir`; repo-level run paths; multi-workspace case/suite layout.
- `apps/desktop/scripts/make-fixture.mts` - Write the `.casewright/` layout + per-workspace `casewright.yaml`.

**Sub-Tasks:**
- [ ] 0501 In `sample.ts`: delete the `rootConfig` export and the `runsDir` field on every `Workspace`; rewrite each run's `file`/`id` to `.casewright/runs/<stem>`; update the `conflict` run `path` to `.casewright/runs/…` (FR 22, 23).
- [ ] 0502 In `sample.ts`, associate suites/cases with **more than one** workspace (e.g. give a second workspace its own suite + cases) and add a run whose rows reference cases from ≥2 workspaces, so the cross-workspace summary metric (PRD §8) is exercised. Adjust the `tree` shape so each workspace's subtree is materializable.
- [ ] 0503 In `make-fixture.mts`: stop writing `casewright.json`/`workspace.yaml`/per-workspace `runs/`; instead write `.casewright/config.yaml` (`serializeConfigYaml`), `.casewright/.gitignore` (`CASEWRIGHT_GITIGNORE`), and the flat `.casewright/runs/` CSV+sidecars; write a `casewright.yaml` per workspace (`serializeWorkspaceYaml`) and materialize each workspace's suite/case subtree under its path (FR 23).
- [ ] 0504 Regenerate via `pnpm --filter @casewright/desktop fixture` and verify `git status` inside `.fixture` shows `.casewright/config.yaml`, `.casewright/runs/`, and `.casewright/.gitignore` tracked while `.casewright/cache/` would be ignored (PRD §8 success metric).

**Notes:**
- Depends on 0100 (types) + 0200 (serializers). The current script only materializes
  `workspaces[0]`'s tree — sub-task 0503 generalizes it to walk per-workspace trees so 0502's
  multi-workspace data actually lands on disk.

---

### [ ] 0600 - Tests: discovery, no-nesting, root-as-workspace, central runs & scaffold

**Overview:** Update and extend the test suite for the new model: fix existing `openRepo`/
`loadWorkspace`/`loadRepo` tests to the `.casewright/` layout, and add coverage for the discovery
walk, no-nesting rule, root-as-single-workspace, central run loading, `.casewright/` requirement,
the `initRepo` scaffold output, and the tightened workspace/config schemas. (PRD §8; FR 1, 3, 6–14,
16, 20.)

**Relevant Files:**
- `apps/desktop/src/services/repo.test.ts` - Rebuilt fixtures + new discovery/nesting/root/central-runs/init tests.
- `apps/desktop/src/services/format/workspace.test.ts` - Round-trip without `runsDir` (create if absent).
- `apps/desktop/src/schemas/config.test.ts` - Config/workspace schema coercion + lint-warning behavior (create if absent).

**Sub-Tasks:**
- [ ] 0601 Rebuild the `repo.test.ts` fixtures to the `.casewright/` layout (write `.casewright/config.yaml`, `.casewright/runs/<…>.csv`, per-workspace `casewright.yaml`) and fix the existing `openRepo`/`loadWorkspace`/`loadRepo` assertions (run `file` now `.casewright/runs/…`, no `runsDir`, workspaces discovered not globbed).
- [ ] 0602 Add discovery-walk tests: a folder with `casewright.yaml` is discovered; `.git`/`.casewright`/dot-folders are skipped; results are ordered alphabetically by name (FR 7, 10).
- [ ] 0603 Add a no-nesting test: a `casewright.yaml` placed in a workspace's subfolder does **not** create a second workspace — the subfolder is a suite within the parent workspace (FR 8).
- [ ] 0604 Add a root-as-workspace test: `<root>/casewright.yaml` yields a single workspace at path `''` with no further discovery, replacing the old implicit-fallback test block (FR 9).
- [ ] 0605 Add missing-`.casewright/` and empty-repo tests: `openRepo` on a Git repo without `.casewright/` emits `needs-init` (does not throw); a `.casewright/` repo with no markers emits the empty-repo warning and zero workspaces (FR 1, 11).
- [ ] 0606 Add an `initRepo` scaffold test: it writes `.casewright/config.yaml`, creates `.casewright/runs/`, and writes a `.casewright/.gitignore` that ignores `cache/` (FR 2, 4).
- [ ] 0607 Add/refresh format + schema tests: `serializeWorkspaceYaml` no longer emits `runsDir`; `serializeConfigYaml` round-trips; `ConfigYamlSchema`/`WorkspaceYamlSchema` coerce malformed input to defaults with `LintWarning`s; central `loadRuns` produces `.casewright/runs/<stem>` ids/files (FR 3, 12–14, 16).

**Notes:**
- Depends on all prior tasks. Run with `pnpm --filter @casewright/desktop test`; typecheck with
  `pnpm --filter @casewright/desktop typecheck`. Both must be green to close out the feature.

## Notes

- Unit tests live alongside the code they cover (e.g. `repo.ts` ↔ `repo.test.ts`).
- Run the suite with `pnpm --filter @casewright/desktop test` (vitest); typecheck with
  `pnpm --filter @casewright/desktop typecheck` (tsc --noEmit).
- **Dependency order is strict:** 0100 → 0200 → 0300 → 0400, with 0500 (fixture/sample) depending on
  0100+0200 and 0600 (tests) depending on everything. Because 0100 removes `Workspace.runsDir` and
  broadens `RunScope`, the project typecheck only returns to green once the consumer tasks
  (0300/0400/0500) land.
- Out of scope (per PRD §5): migration tooling, nested workspaces, glob/allowlist config, the
  structured 3-way merge engine, `cache/` behavior, and the test-execution report itself.
