# Casewright

A git-backed desktop application for writing and running test cases —
_a craftsman's editor for manual test cases; markdown on disk, Git as the data store._

This is a [Turborepo](https://turbo.build/repo) monorepo (pnpm workspaces).

## Workspace

```
casewright/
├── apps/
│   ├── desktop/        # the Casewright app — NW.js (the design prototype, brought in as-is)
│   └── web/            # the marketing site — Astro static site, deployed to GitHub Pages
├── packages/
│   └── brand/          # @casewright/brand — shared design tokens (palette, type, status colors)
├── turbo.json          # task pipeline
└── pnpm-workspace.yaml
```

| Package                | What it is                                                  |
| ---------------------- | ----------------------------------------------------------- |
| `@casewright/desktop`  | NW.js desktop app. See [`apps/desktop/README.md`](apps/desktop/README.md). |
| `@casewright/web`      | Astro marketing site → GitHub Pages.                        |
| `@casewright/brand`    | Design tokens shared by both apps.                          |

## Prerequisites

- **Node** ≥ 22 (`.nvmrc` pins 22; `fnm use` / `nvm use` will pick it up)
- **pnpm** ≥ 11 — `corepack enable` provides the pinned version from `packageManager`

Build-script approvals and pnpm 11's supply-chain `minimumReleaseAge` gate are configured in
[`pnpm-workspace.yaml`](pnpm-workspace.yaml) (the age gate is set to `0` so tracking the latest
of everything isn't blocked by same-day releases — raise it to re-enable the safety window).

## Getting started

```bash
pnpm install        # first run also downloads the NW.js runtime for the desktop app (~200 MB)
pnpm dev            # run everything via turbo
```

Or target one app:

```bash
pnpm dev:web        # Astro dev server (http://localhost:4321)
pnpm dev:desktop    # launches the NW.js desktop app
```

> Tip: to skip the large NW.js download while working only on the site, install just the web
> graph: `pnpm install --filter @casewright/web...`.

## Common scripts (root)

| Command            | Does                                              |
| ------------------ | ------------------------------------------------- |
| `pnpm dev`         | `turbo run dev` across all apps                   |
| `pnpm build`       | `turbo run build` (currently builds the web site) |
| `pnpm build:web`   | build just the marketing site to `apps/web/dist`  |
| `pnpm lint`        | `turbo run lint` (Astro type-check on the site)   |
| `pnpm clean`       | `turbo run clean`                                 |

## Deploying the marketing site

[`.github/workflows/deploy-web.yml`](.github/workflows/deploy-web.yml) builds `apps/web` and
publishes it to **GitHub Pages** on every push to `main` that touches the site.

To turn it on: **Settings → Pages → Build and deployment → Source: _GitHub Actions_.** The
workflow derives the correct `site` and `base` automatically (project site → `/casewright`,
user/org site → `/`), so no config edit is needed. Commit `pnpm-lock.yaml` so the frozen
install resolves in CI.

## Status

The desktop app is the exported **design prototype** wired into NW.js so it runs today; the
productionization follow-ups are tracked in [`apps/desktop/README.md`](apps/desktop/README.md).
The marketing site is a complete static landing page built on the shared brand tokens.
