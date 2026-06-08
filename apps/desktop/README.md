# @casewright/desktop

The Casewright desktop application — _a craftsman's editor for manual test cases; markdown on
disk, Git as the data store._ Built with [NW.js](https://nwjs.io/).

## Running

From the **repo root**:

```bash
pnpm install          # the first install downloads the NW.js runtime (~200 MB)
pnpm dev:desktop      # launches the app via `nw .`
```

…or from this directory: `pnpm dev`.

NW.js is pinned to the **SDK flavor** (`nw@0.112.0-sdk`) so DevTools are available during
development (right-click → Inspect, or `F12`).

## Layout

```
src/
├── index.html          # NW.js entry (the manifest `main`)
├── vendor/             # React, ReactDOM, Babel — vendored so the app runs offline
├── styles.css          # design tokens + base styles (mirrors @casewright/brand)
├── app.css             # component / layout styles
├── data.js, util.js    # sample data + helpers
├── icons.jsx           # line-icon set
├── app.jsx             # app root: context, top bar, Git modals
├── launcher.jsx        # repo launcher / recents
├── sidebar.jsx         # suite/case tree, search, filters, drag + context menus
├── editor.jsx          # structured case editor
├── runs.jsx            # run list + run grid
├── runguide.jsx        # guided test runner
└── merge.jsx           # structured 3-way merge resolver (the showpiece)
```

## Status & next steps

This is the design prototype brought in **verbatim** as the renderer, so the app shows the real
Casewright UI today. Intentional follow-ups (not yet done):

- **Replace in-browser Babel with a real build step.** The prototype transpiles JSX at runtime
  via `@babel/standalone`. Swap in a bundler (esbuild/Vite) and ship precompiled JS.
- **Wire NW.js native APIs.** The prototype's context-menu actions (Reveal in File Explorer,
  Open in default editor, …) are mocked; back them with `nw.Shell` / `nw.Menu`.
- **Back the data layer with the filesystem + Git** instead of the in-memory `data.js` sample.
- **Decide on window chrome.** The prototype draws its own titlebar (traffic lights + centered
  title); to use it, switch the manifest `window.frame` to `false` and add drag regions.
- **Packaging.** Add a `build` script (e.g. `nw-builder`) to produce distributables.

Shared brand tokens live in [`@casewright/brand`](../../packages/brand); `src/styles.css`
currently carries its own copy and can migrate to importing them once a build step exists.
