import { z } from 'zod';

/**
 * `.casewright/config.yaml` — the repo-wide config (replaces the old root
 * `casewright.json`). Minimal schema; parsing is tolerant (PRD §4 req 3): unknown
 * keys are accepted and preserved, and a malformed file coerces to these defaults
 * with a lint warning rather than failing the open. It carries **no** workspace
 * list — discovery is automatic (req 6–11).
 */
export const ConfigYamlSchema = z.looseObject({
  version: z.coerce.number().int().catch(1).default(1),
  name: z.coerce.string().optional(),
});

export type ConfigYaml = z.infer<typeof ConfigYamlSchema>;
