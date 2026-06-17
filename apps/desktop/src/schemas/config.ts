import { z } from 'zod';

/**
 * The markdown renderer a repo targets. Casewright stores cases as markdown on disk and the
 * git repo *is* the data store, so when a repo is rendered as a wiki (e.g. an Azure DevOps
 * wiki points straight at it) the on-disk bytes must satisfy that renderer's list-nesting
 * rules. Every target currently resolves to the same content-aligned (4-space) indent unit
 * — they differ by label and leave room for future per-platform quirks. `commonmark` is the
 * portable default that renders correctly on all of the named platforms.
 */
export const MARKDOWN_TARGETS = ['commonmark', 'azure-devops', 'github', 'gitlab'] as const;
export type MarkdownTarget = (typeof MARKDOWN_TARGETS)[number];
export const MarkdownTargetSchema = z.enum(MARKDOWN_TARGETS).catch('commonmark').default('commonmark');

/**
 * `.casewright/config.yaml` — the repo-wide config and the single source of truth for
 * which folders are workspaces (`workspaces:` — a list of repo-relative paths, `.` = the
 * repo root). Parsing is tolerant: unknown keys are accepted and a malformed file coerces
 * to these defaults with a lint warning rather than failing the open. `displayIdPrefix`
 * and `description` carry the *root* workspace's metadata (the root has no parent dir for
 * a sibling folder note, so it lives here instead). `markdownTarget` is repo-wide — one
 * canonical serialization per repo, so the structured merge resolver stays unaffected.
 */
export const ConfigYamlSchema = z.looseObject({
  version: z.coerce.number().int().catch(1).default(1),
  name: z.coerce.string().optional(),
  workspaces: z.array(z.coerce.string()).catch([]).default([]),
  displayIdPrefix: z.coerce.string().optional(),
  description: z.coerce.string().optional(),
  markdownTarget: MarkdownTargetSchema,
});

export type ConfigYaml = z.infer<typeof ConfigYamlSchema>;
