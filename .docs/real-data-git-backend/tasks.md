# Real Data + Git Backend — Implementation Tasks

## Overview

Replace the desktop app's faked, in-memory POC data (`src/data/sample.ts`, mutated purely in the
Zustand store) with a **real on-disk + Git backend** per the PRD: cases are markdown files with YAML
front matter + structured body, suites are folders, runs are CSVs, and the Git repository *is* the
data store. This workstream delivers **read + write + the Git loop** (status / commit / pull / push)
using `simple-git`, `gray-matter`, `papaparse`, and `zod`.

**The structured 3-way merge engine is deferred to a follow-up.** Conflicted pulls are handled
gracefully (a banner + `git merge --abort`) but the structured resolver is not yet fed from real git
stages; the merge UI is decoupled from sample data and left ready for that follow-up.

Node access is **NW.js-native**: a runtime `require` bridge in the renderer with Vite externalizing
node-only deps (PRD §9 — "Node and WebKit in the same thread; `require()` from the renderer"). The
hand-written domain types in `src/types/index.ts` are kept; new **Zod schemas describe only the
on-disk shapes** and are mapped at the serialization boundary.

> Source of truth: `.docs/prd.md` (§5 data model, §6 functional reqs, §9 architecture, §10
> acceptance) and the approved plan at `~/.claude/plans/the-current-desktop-app-calm-jellyfish.md`
> (Workstream B). Recommended to run **after** Workstream A (Tailwind/shadcn).

## Tasks

### [x] 0100 - Node/build bridge

**Overview:** Make Node-only modules (`fs`, `simple-git`, `gray-matter`, `papaparse`) available at
runtime in the Vite-bundled NW.js renderer via a single typed `require` bridge, and externalize them
from the Vite bundle so they're `require`d at runtime instead of bundled.

**Relevant Files:**
- `apps/desktop/src/lib/node.ts` - New runtime `require` bridge (+ `NotInNwjsError`).
- `apps/desktop/src/lib/nwjs.ts` - Extend with `nw.App.dataPath` + `pickDirectory()`.
- `apps/desktop/vite.config.ts` - Externalize node-only deps; `optimizeDeps.exclude`.
- `apps/desktop/package.json` - Move node-only libs to `dependencies`; add `rollup-plugin-node-externals`.
- `apps/desktop/scripts/dev.mjs` - Reference only (already sets `node-remote` in dev).

**Sub-Tasks:**
- [x] 0101 Added to **dependencies**: `simple-git`, `gray-matter`, `papaparse`, `zod`, `nanoid`; devDeps: `@types/papaparse`, `@types/node`.
- [x] 0102 Created `src/lib/node.ts`: `NotInNwjsError`; `nodeRequire()` from `globalThis.require ?? window.nw?.require`; memoized typed getters `node.fsp()`/`path()`/`os()`/`simpleGit()`/`matter()`/`papa()` via dynamic `require(<string>)` (type-only imports → erased; libs never bundled).
- [x] 0103 Extended `src/lib/nwjs.ts`: `appDataPath()` (`nw.App.dataPath`) + `pickDirectory()` via a hidden `<input nwdirectory>` (with focus-based cancel detection).
- [x] 0104 `vite.config.ts`: `optimizeDeps.exclude` for the node-only libs. **Dropped `rollup-plugin-node-externals`** — its latest build calls `RegExp.escape` (unavailable on Node 22.15) and it's redundant: the dynamic-`require` bridge already keeps these libs out of the bundle (verified: JS bundle size unchanged, no lib source bundled).
- [x] 0105 Build + typecheck clean; libs confirmed not bundled. The in-NW.js `require()` resolution check needs a real NW.js run (not possible headlessly here) — correct by construction; the Node-side require path is exercised by the Vitest setup in 0300.

**Notes:**
- Prod loads via `file://` (Node integration on) — no `node-remote` change needed; dev already sets it.
- Packaging a flattened prod `node_modules` for nw-builder is a later concern; libs are in real `dependencies` + kept unbundled, which de-risks it. Flagged, not solved here.

---

### [x] 0200 - Zod schemas + serialize/parse format layer

**Overview:** Define Zod schemas for the on-disk shapes and the pure functions that serialize/parse
case markdown, run CSV, and suite metadata — reusing the existing serialization helpers and keeping
the minimal-diff guarantees.

**Relevant Files:**
- `apps/desktop/src/schemas/{config,workspace,case,suite,run,index}.ts` - New Zod schemas + `LintWarning`.
- `apps/desktop/src/services/format/{case,run,suite,filename}.ts` - New serialize/parse (pure).
- `apps/desktop/src/utils/steps.ts`, `ids.ts`, `markdown.tsx` - Reused (`stepText`/`numberSteps`/`listText`, `slug`, `sanitizeInline`/`hasBlockConstructs`).

**Sub-Tasks:**
- [x] 0201 `schemas/{config,workspace,case,suite,run,index}.ts`: all schemas (Zod v4) with tolerant `.catch()`/`.default()`; `index.ts` re-exports + `LintWarning`, `RUN_CSV_COLUMNS`.
- [x] 0202 `services/format/filename.ts`: `caseFileName(c) = `<displayId>-<slug(title)>.md`` + `runFileStem(name, date)`.
- [x] 0203 `services/format/case.ts` → `serializeCase`: **manual** front matter (stable key order, inline `tags`, YAML-safe scalars) + 4 reserved sections in fixed order even when empty; steps = 2-space indent + per-level ordinal; `- ` bullets; single trailing newline; re-appends captured `extra`.
- [x] 0204 `services/format/case.ts` → `parseCase`: gray-matter (via the node bridge) + `safeParse`; split on reserved headings; step depth = `floor(leadingSpaces/2)`, ordinals stripped; collects `extra` + `LintWarning[]`; generates `id` if missing; returns `Case` minus `suite`/`modified`.
- [x] 0205 `services/format/run.ts`: `serializeRunCsv`/`parseRunCsv` (papaparse, 7 columns, `RunRowSchema`) + run sidecar parse/serialize.
- [x] 0206 `services/format/suite.ts`: `_suite.md` parse/serialize.
- [x] 0207 De-demoed `src/utils/ids.ts`: `randomId`→nanoid `customAlphabet` (`[a-z0-9]`, 11 chars); `nowStamp`→`new Date()` `YYYY-MM-DD HH:MM`.

**Notes:**
- Validation is non-blocking (`safeParse` → defaults + `LintWarning`) per PRD §5.2.
- Serialize is pure (no bridge); parse uses `node.matter()`/`node.papa()`. Round-trip + golden tests land in 0300 (need the Vitest alias + require-inject setup). Canonical Steps use 2-space indent per the PRD rule (parser tolerates the example's 3-space form).

---

### [x] 0300 - Testing harness: fixture repo + Vitest

**Overview:** Stand up the dev/test harness: a generator that materializes the current sample data
into a **real git repo** to run the app against, plus Vitest unit tests for the pure
serialize/parse functions (the riskiest logic), runnable in plain Node.

**Relevant Files:**
- `apps/desktop/scripts/make-fixture.mjs` - New fixture-repo generator.
- `apps/desktop/vitest.config.ts` - New Vitest config.
- `apps/desktop/src/services/format/case.test.ts` - Round-trip + golden-file tests.
- `apps/desktop/src/services/format/run.test.ts` - CSV round-trip + schema validation.
- `apps/desktop/package.json` - `test` script.

**Sub-Tasks:**
- [x] 0301 Added `vitest` + `vite-node`; `test`/`fixture` scripts; `vitest.config.ts` (`@` alias) + `vitest.setup.ts` (injects `globalThis.require` so the node bridge resolves modules in tests).
- [x] 0302 `case.test.ts`: golden serialize === PRD §5.2 canonical; parse round-trip; tolerant 3-space steps; missing-id generation; out-of-schema preservation; **idempotent serialize for every sample case** + structural-field round-trip.
- [x] 0303 `run.test.ts`: CSV round-trip (incl. comma-quoting), 7-column header, `RunRowSchema` coercion (bad `result`→`not_run`), missing-column warning, sidecar round-trip.
- [x] 0304 `make-fixture.mts` (run via vite-node so it reuses the real `serializeCase`/`serializeRunCsv`): writes `casewright.json`, per-workspace `workspace.yaml`, the suite-folder tree, `<displayId>-<slug>.md` cases, run CSV+sidecars; `git init && add && commit` on `main`; `--with-origin` adds a bare `.fixture-origin.git` remote + push. Output gitignored.
- [x] 0305 `pnpm test` → 17 passing; `pnpm fixture --with-origin` → inspected: real git repo, canonical files, correct folder tree, origin pushed.

**Notes:**
- The format layer uses the node bridge uniformly (NW.js + Vitest via the setup-injected require), rather than importing gray-matter/papaparse directly.
- The fixture is the canonical dev target for 0400 onward (`pnpm dev:desktop` opened against `.fixture/`).

---

### [x] 0400 - Filesystem repo service: read path (open → render)

**Overview:** Implement opening a repository and loading a workspace from disk, store recents in the
OS data dir, and rewire the store + launcher so the app renders a real repo. No writes yet.

**Relevant Files:**
- `apps/desktop/src/services/repo.ts` - New: `openRepo`, `loadWorkspace`, glob resolution.
- `apps/desktop/src/services/recents.ts` - New: recents in `nw.App.dataPath`.
- `apps/desktop/src/store/app-store.ts` - Remove sample seeding; async `openRepo`/`setWorkspace`; new state.
- `apps/desktop/src/components/launcher/Launcher.tsx` - Real recents + folder picker + spinner.
- `apps/desktop/src/components/App.tsx` - Loading/error gate.
- `apps/desktop/src/components/merge/MergeResolver.tsx` - Read `conflict` from store (nullable), not sample.
- `apps/desktop/src/types/index.ts` - Reshape `Recent` (ISO `lastOpened`, `lastWorkspaceId`).

**Sub-Tasks:**
- [x] 0401 `repo.ts` `openRepo(path)`: `simple-git` worktree check; read+validate `casewright.json` (fallback: single implicit workspace + warning); resolve globs (`qa/*` + explicit, custom matcher); each `workspace.yaml` → `Workspace` (`displayIdPrefix`→`prefix`); returns workspaces + branch + warnings.
- [x] 0402 `repo.ts` `loadWorkspace`: walks folders → `TreeNode[]` (suite id = `slug(relPath)`, `_suite.md` display name); parses every `*.md` (skips `_suite.md` + runs dir) → `Case[]`; reads `runsDir/*.csv` + sidecars → `Run[]`; collects `LintWarning[]`.
- [x] 0403 `recents.ts`: `listRecents`/`addRecent`/`removeRecent` in `nw.App.dataPath` (no-ops to `[]` outside NW.js); `Recent` reshaped to ISO `lastOpened` + `lastWorkspaceId`.
- [x] 0404 Store: removed sample seeding; initial `cases/runs/tree = []`, `workspace = null`; added `repoPath/loading/error/warnings/recents/conflict:null`; async `openRepo(path?)` (pickDirectory fallback + `addRecent`) / `setWorkspace`; `casePath` uses `caseFileName`.
- [x] 0405 `Launcher`: store recents + `timeAgo`; "Open repository…" → async `openRepo()`; spinner ("Opening…"); empty-state.
- [x] 0406 `App`: renders the workbench only when a `workspace` is loaded; `MergeResolver` reads nullable `conflict` from the store.
- [x] 0407 Guarded `workspace == null` in `TopBar` (early return + real repo name) / `CaseEditor` / `RunsList` / `CreateRunModal` / `TitleBar`.
- [x] 0408 **Read-path logic verified via a Vitest integration test (`repo.test.ts`) against a real temp git repo** (openRepo + loadWorkspace → tree/cases/runs); browser-verified the launcher empty-state mounts cleanly. The live NW.js render against `.fixture/` needs a real NW.js run (not possible headlessly here).

**Notes:**
- The merge UI is decoupled from sample data (store `conflict: null`), so `sample.ts` can be deleted in 0700.
- No persistence yet — read-only proof that the bridge + format + repo layer work; the bundle confirms the node libs are runtime-required, not bundled.

---

### [ ] 0500 - Filesystem repo service: write path / CRUD persistence

**Overview:** Persist every mutation to disk. Keep the snappy UX with optimistic in-memory updates
(existing reducers) plus a debounced write and reload-on-error.

**Relevant Files:**
- `apps/desktop/src/services/repo.ts` - Add write/move/rename/delete ops.
- `apps/desktop/src/store/app-store.ts` - Mutating actions → async (optimistic + persist).
- `apps/desktop/src/components/editor/CaseEditor.tsx`, `sidebar/Sidebar.tsx`, `runs/*` - Async coping.

**Sub-Tasks:**
- [ ] 0501 `repo.ts` case ops: `writeCase`, `createCaseFile`, `duplicateCaseFile`, `moveCase` (fs.rename across folders), `renameCaseFile` (on title/displayId change), `deleteCaseFile`.
- [ ] 0502 `repo.ts` suite ops: `createSuiteDir`, `renameSuiteDir` (folder rename moves children), `deleteSuiteDir` (guarded recursive).
- [ ] 0503 `repo.ts` run ops: `createRunFiles` (CSV + sidecar `.md`), `updateRunCsv`.
- [ ] 0504 Store: make `updateCase`/`createCase`/`duplicateCase`/`deleteCase`/`createSuite`/`renameSuite`/`deleteSuite`/`moveNodeToParent`/`updateRunRow`/`createRun` async — optimistic in-memory (keep existing reducers) + persist + reload-on-error toast.
- [ ] 0505 Debounce `updateCase`/`updateRunRow` writes (~400ms; flush on blur/selection change); rename the file when title/displayId changes.
- [ ] 0506 Verify: mutate in-app → inspect `.fixture/` on disk (`git status`, open the `.md`/`.csv`) for clean, minimal diffs + trailing newline; reopen the repo → state persists.

**Notes:**
- `changes`/dirty still use the existing `modified` flag until 0600 swaps it for `git status`.
- Filename convention change (`displayId+slug`) means edits must rename on disk — handle in `renameCaseFile`.

---

### [ ] 0600 - Git service + loop (status / commit / pull / push)

**Overview:** Wrap `simple-git` for real status, commit, push, and pull; derive dirty state from
`git status`; and handle conflicted pulls safely (the structured merge engine is deferred).

**Relevant Files:**
- `apps/desktop/src/services/git.ts` - New simple-git wrapper.
- `apps/desktop/src/store/app-store.ts` - `refreshStatus`; async git actions; conflict banner.
- `apps/desktop/src/components/chrome/TopBar.tsx`, `common/CommitModal.tsx` - Real git state.

**Sub-Tasks:**
- [ ] 0601 `git.ts`: `repo(repoPath)` = `simpleGit(repoPath)`; `status()` → `{ branch, ahead, behind, files }` mapping porcelain → `Change[]` (kind from path: `runsDir/*.csv` → `'run'`, else `'case'`).
- [ ] 0602 `git.ts`: `stageAndCommit(paths, msg)`, `push()`, `pull()` (fetch+merge), `conflictedFiles()`, `readStage(1|2|3, path)` (`git show :N:path`), `completeMerge()`, `abortMerge()`; wrap push/pull → `GitAuthError` on credential failure.
- [ ] 0603 Store: `refreshStatus()` sets `branch`/`ahead`/`behind`/`changes` from `git status`; call after writes (debounced) + after commit/pull/push; remove the manual `upsertChange` + hardcoded `branch:'main', ahead:1, behind:3`.
- [ ] 0604 Store: `doCommit`/`doPush` async (+ `gitBusy`); `doPull` async — clean merge → reload + `refreshStatus`; conflicts → set a banner + expose `abortMerge` (structured resolver deferred; `conflict` stays null).
- [ ] 0605 `TopBar`: real repo name / branch / ahead-behind; disable git buttons while `gitBusy`; surface `GitAuthError` as a toast. `CommitModal`: real `changes` + branch.
- [ ] 0606 Verify: against `.fixture/` + a bare `origin` → commit (`git log` shows it), push (origin receives), make a divergent upstream commit → pull updates ahead/behind, clean-merges, or shows the conflict banner; `abortMerge` restores a clean tree.

**Notes:**
- Auth uses the system credential helper (PRD §6.6); the app stores no secrets — just surface a clear error.
- The structured 3-way merge engine (`services/merge.ts`, real `buildConflict`/`applyMerge`) is the **deferred follow-up**; 0600 only needs status/commit/push/pull + safe conflict handling.

---

### [ ] 0700 - Cleanup + end-to-end verification

**Overview:** Remove the dead sample module, de-demo remaining hardcoded strings, and verify the
whole loop end-to-end against the fixture in NW.js.

**Relevant Files:**
- `apps/desktop/src/data/sample.ts` - Delete (its data lives on as the `make-fixture` seed).
- `apps/desktop/README.md`, memory - Update to the real-data architecture.

**Sub-Tasks:**
- [ ] 0701 Delete `src/data/sample.ts`; fix/remove any remaining imports.
- [ ] 0702 De-demo remaining hardcoded strings (e.g. TopBar repo crumb, any leftover demo dates).
- [ ] 0703 Full `typecheck` + `build` + `vitest` green.
- [ ] 0704 End-to-end in NW.js against the fixture: open → render → CRUD (inspect disk) → commit/push/pull against the bare origin.
- [ ] 0705 Update `apps/desktop/README.md` (+ memory) to reflect the on-disk + git architecture; note the deferred follow-ups.

**Notes:**
- Deferred follow-ups (separate plan): the structured 3-way merge engine, multi-window same-repo guard, a lint-warnings panel, `_suite.md` display names, and run sidecar metadata.

## Notes

- Strict order: 0100 → 0200 → 0300 → 0400 → 0500 → 0600 → 0700. 0300's fixture is the dev target for 0400+.
- Unit tests live alongside the code (`services/format/case.test.ts` next to `case.ts`). Run with `npx vitest [path]` (or `pnpm --filter @casewright/desktop test`).
- Real data requires NW.js + a git repo — verify via `pnpm dev:desktop` against `.fixture/`; the old browser-based Playwright smoke can't exercise fs/git.
- Run Workstream A (`.docs/tailwind-shadcn-replatform/tasks.md`) first so this workstream edits already-converted components.
