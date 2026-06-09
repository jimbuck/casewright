# @casewright/desktop

The Casewright desktop application — _a craftsman's editor for manual test cases; markdown on
disk, Git as the data store._ Built with **NW.js + React + TypeScript** (Vite).

## Running

From the **repo root**:

```bash
pnpm install          # the first install downloads the NW.js runtime (~200 MB)
pnpm dev:desktop      # Vite dev server (HMR) + NW.js window pointed at it
```

…or from this directory: `pnpm dev`.

`scripts/dev.mjs` starts Vite, writes a throwaway `.nwdev/` manifest whose `main` is the dev-server
URL, and launches NW.js against it — so you get hot reload inside the real desktop window. NW.js is
the **SDK flavor** (`nw@0.112.0-sdk`), so DevTools are available (`F12`).

### Production build

```bash
pnpm --filter @casewright/desktop build   # Vite → dist/
pnpm --filter @casewright/desktop start    # nw . → loads dist/index.html
```

The NW.js manifest (`package.json`) sets `main: dist/index.html`; Vite emits **relative** asset
paths (`base: './'`) so it loads from `file://`.

## Architecture

```
src/
├── main.tsx                  # React root + app.css import
├── types/                    # domain model (Case, TreeNode, Run, Conflict, …)
├── schemas/                  # Zod schemas for the on-disk shapes + LintWarning
├── services/                 # the real backend:
│   ├── format/               #   serialize/parse case markdown, run CSV, suite, filename
│   ├── repo.ts               #   .casewright/ discovery + load (read) + initRepo scaffold + fs writes
│   ├── git.ts                #   simple-git wrapper (status/commit/push/pull/abort)
│   ├── recents.ts            #   recents.json in nw.App.dataPath
│   ├── persist.ts            #   debounce + flush for disk writes
│   └── watch.ts              #   fs.watch the repo → live-reload on external changes
├── data/sample.ts            # seed data for the fixture + tests (NOT app data)
├── utils/                    # markdown render, word diff, step numbering, ids, cx
├── store/app-store.ts        # the app store — a typed Zustand store + useApp() hook
├── lib/
│   ├── node.ts               # runtime require() bridge for Node-only modules
│   └── nwjs.ts               # NW.js window helpers + dataPath + pickDirectory
├── styles/app.css            # Tailwind v4 + brand-token @theme bridge
└── components/
    ├── App.tsx               # view routing + modals + merge-conflict banner
    ├── icons.tsx             # the line-icon set
    ├── ui/                   # shadcn/Radix primitives over Tailwind: Button, Input, Select,
    │                         #   Textarea, Tag, StatusPill, ResultSwatch, Field, Modal, Kbd,
    │                         #   dropdown-menu, context-menu
    ├── chrome/               # TitleBar (custom frameless), TopBar, Toasts
    ├── launcher/             # Launcher (recents + picker + .casewright/ init & empty states)
    ├── sidebar/              # Sidebar (tree DnD + filters + Radix context menu)
    ├── editor/               # CaseEditor + Objective / List / Steps / Tag controls
    ├── runs/                 # RunsList, RunGrid, CreateRunModal, NotesCell
    ├── guide/                # RunGuide + checklist
    ├── merge/                # the structured 3-way merge resolver (decoupled; deferred engine)
    └── common/               # CommitModal, EmptyCenter
```

The UI is **Tailwind v4 + shadcn/ui (Radix)**; the `ui/` primitives keep a stable export
surface (`<Button variant="primary" size="sm">`). The brand oklch tokens in
[`@casewright/brand`](../../packages/brand) are bridged into Tailwind via `@theme inline` in
`styles/app.css` and remain the single source of truth (shared with the marketing site).

**Data layer.** The Git repository _is_ the data store. A repo is marked by a **`.casewright/`**
folder at its root (`config.yaml` + a central `runs/` + an auto-managed `.gitignore`), and each
workspace declares itself with a **`casewright.yaml`** — discovered by a one-time walk on open, so
there is no central registry to maintain. `services/repo.ts` validates `.casewright/`, discovers
workspaces, loads the suite/case tree + repo-level run CSVs, and writes cases/suites/runs and
workspace config back as plain files (`initRepo` scaffolds `.casewright/` for an un-initialized
repo); `services/git.ts` drives status/commit/push/pull. Node-only modules (`fs`, `simple-git`,
`gray-matter`, `papaparse`) load at runtime through the `lib/node.ts` bridge (NW.js shares Node with
the renderer), so they're never bundled.

A casewright repository looks like:

```
my-repo/
├── .casewright/
│   ├── config.yaml          # repo-wide config (version, optional name)
│   ├── runs/                # all run CSVs + .md sidecars — repo-level, may span workspaces
│   └── .gitignore           # keeps cache/ out of Git (config.yaml + runs/ are committed)
├── areas/payments/
│   ├── casewright.yaml      # presence declares this folder a workspace (name, displayIdPrefix)
│   ├── Authentication/      # suites are just folders
│   │   └── PAY-0001-….md    # cases are markdown files
│   └── Billing/…
└── areas/onboarding/
    ├── casewright.yaml
    └── Activation/…
```

Workspaces don't nest (the walk stops at the first `casewright.yaml`); if the root itself has a
`casewright.yaml`, the whole repo is a single workspace.

External changes are picked up **live** — `services/watch.ts` watches the working tree (Node's
recursive `fs.watch`) and, on a debounced tick, re-runs discovery + load so cases / suites /
workspaces created or edited outside the app (an editor, Claude Code, `git pull`/`checkout`) appear
automatically. The app's own writes are filtered out (self-write tracking in `repo.ts`) so saves
don't self-trigger, and the active selection is preserved across a reload.

The window is **frameless** (`window.frame: false`) with a custom VS Code–style **titlebar**
(`chrome/TitleBar.tsx`): an app-region drag bar with a File/View/Go/Help menu bar (wired to app
actions, reusing the `ContextMenu`) and Windows-style minimize / maximize / close controls backed
by `lib/nwjs.ts`. Outside NW.js (dev preview / tests) the controls no-op gracefully.

## Testing & the fixture repo

```bash
pnpm --filter @casewright/desktop test            # Vitest: format round-trips, schema coercion, repo/git integration
pnpm --filter @casewright/desktop fixture         # materialize a real .fixture/ repo from the seed
pnpm --filter @casewright/desktop fixture --with-origin   # …plus a bare .fixture-origin.git remote
```

`scripts/make-fixture.mts` turns the seed in `src/data/sample.ts` into a **real Git repository**
(under `.fixture/`, gitignored) using the same serializers the app uses — the canonical dev/test
target. Run the app against it (`pnpm dev:desktop`, then Open repository… → `.fixture/`). The
Vitest suite covers the pure format layer plus integration tests for `repo.ts`/`git.ts` against
temp git repos (open/load, write/rename/delete, commit/push/pull/conflict+abort).

## Packaging & releases (Windows)

The Windows desktop app is built and published by the **Release desktop** workflow
([`.github/workflows/release-desktop.yml`](../../.github/workflows/release-desktop.yml)). Cut a
release by pushing a version tag — the version is taken from the tag:

```bash
git tag v0.1.0
git push origin v0.1.0          # → builds on windows-latest, publishes a GitHub Release
```

(or run it manually from the **Actions** tab, supplying the version). Each run produces two assets:

- **`Casewright-Setup-<version>.exe`** — a per-user installer (no admin/UAC), with a Start-Menu
  shortcut and uninstaller. Built with **Inno Setup** ([`build-resources/casewright.iss`](build-resources/casewright.iss)).
- **`Casewright-<version>-win-x64.zip`** — a portable build (unzip and run `Casewright.exe`).

### Building locally

```bash
pnpm --filter @casewright/desktop package:win   # vite build → stage → nw-builder → portable zip
```

This runs [`scripts/package-win.mjs`](scripts/package-win.mjs), which:

1. **Stages** a minimal NW.js manifest + the built `dist/` under `build/staging/`.
2. **`npm install`s only the runtime node-deps** there (`simple-git`, `gray-matter`, `papaparse`) —
   the libs Vite leaves un-bundled (`lib/node.ts`). pnpm's symlinked store can't be copied into a
   distributable, so the app ships its own flat `node_modules`.
3. Runs **`nw-builder`** (pinned to the same NW.js version as the dev `nw` devDep, _normal_ flavor)
   to merge the staged app into `build/out/Casewright.exe` (+ the Chromium runtime), with the icon
   and version metadata embedded.
4. **Zips** `build/out/` into `build/Casewright-<version>-win-x64.zip`.

The installer step (Inno Setup) runs in CI; build it locally with
`ISCC.exe /DMyAppVersion=0.1.0 build-resources/casewright.iss` if you have Inno Setup 6 installed.

The app **icon** (`build-resources/icon.ico`) is generated from the shared brand mark
(`@casewright/brand/logo-mark.svg`) by [`scripts/make-icon.mjs`](scripts/make-icon.mjs); it's
committed, so packaging needs no rasterizer. Re-run `pnpm --filter @casewright/desktop make-icon`
whenever the mark changes. Everything under `build/` and `.nwcache/` is gitignored.

## Status & next steps

The desktop app is a typed, modular **React 19 + Tailwind v4 + shadcn** app backed by a real
on-disk + Git data layer (verified: `tsc` clean, `vite` build, 47 Vitest tests, and a Node-level
end-to-end open → load → edit → `git status` against the fixture). Intentional follow-ups:

- **Structured 3-way merge engine.** The resolver UI (`components/merge/*`) is in place but
  decoupled from real git stages; conflicted pulls currently show a banner + `git merge --abort`.
  The follow-up wires `services/merge.ts` (`buildConflict` from `git show :1/:2/:3`, per-element
  3-way per PRD §6.7) to populate the store `conflict` and re-enable the resolver.
- **Wire NW.js native shell APIs.** The right-click actions (Reveal in File Explorer, Open in
  default editor, …) are still mocked toasts; back them with `nw.Shell`.
- **Preserve out-of-schema content** through the store (the format layer captures it; the store
  round-trip currently drops it), a lint-warnings panel, `_suite.md` display names, run sidecar
  metadata, and a multi-window same-repo guard.
- **macOS / Linux packaging.** The Windows pipeline is in place (see _Packaging & releases_ above);
  `nw-builder` can target `osx`/`linux` too — add matrix jobs + per-OS bundling (`.dmg` / `.AppImage`)
  when those platforms are in scope.
