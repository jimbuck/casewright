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
├── main.tsx                  # React root + global style imports
├── types/                    # domain model (Case, TreeNode, Run, Conflict, …)
├── data/sample.ts            # the in-memory sample repository (typed)
├── utils/                    # markdown render, word diff, step numbering, ids, cx
├── store/app-context.tsx     # the app store — typed React context + useApp() hook
│                             #   (replaces the prototype's window.CW globals)
├── styles/                   # base.css + components.css (tokens come from @casewright/brand)
└── components/
    ├── App.tsx               # provider + window chrome + view routing + modals
    ├── icons.tsx             # the line-icon set
    ├── ui/                   # shadcn-style base components: Button, Input, Select,
    │                         #   Textarea, Tag, StatusPill, ResultSwatch, Field, Modal, Kbd
    ├── chrome/               # TitleBar, TopBar, Toasts
    ├── launcher/             # Launcher
    ├── sidebar/              # Sidebar (tree DnD + filters) + ContextMenu
    ├── editor/               # CaseEditor + Objective / List / Steps / Tag controls
    ├── runs/                 # RunsList, RunGrid, CreateRunModal, NotesCell
    ├── guide/                # RunGuide + checklist
    ├── merge/                # the structured 3-way merge resolver (the showpiece)
    └── common/               # CommitModal, EmptyCenter
```

The **`ui/` primitives** are shadcn-style components (typed prop variants like
`<Button variant="primary" size="sm">`) that render the design-token CSS classes — the visual
design is unchanged, only the component API is added. Shared design tokens live in
[`@casewright/brand`](../../packages/brand).

## Status & next steps

The full prototype has been ported to a typed, modular React app (verified: `tsc` clean, `vite`
build, and a browser smoke test through the launcher → editor → merge resolver). Intentional
follow-ups:

- **Wire NW.js native APIs.** The context-menu actions (Reveal in File Explorer, Open in default
  editor, …) are still mocked toasts; back them with `nw.Shell` / `nw.Menu`.
- **Back the data layer with the filesystem + Git** instead of the in-memory `data/sample.ts`.
- **Window chrome.** The app still draws the prototype's own titlebar; to use it, set the manifest
  `window.frame` to `false` and add drag regions.
- **Packaging.** A GitHub release workflow producing a single Windows `.exe` (via `nw-builder`) is
  the agreed next deliverable — it will package this `dist/` output.
