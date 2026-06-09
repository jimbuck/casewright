import type { ConfigYaml } from '@/schemas';
import { yamlScalar } from './workspace';

/**
 * The `.casewright/.gitignore` body. Keeps transient subdirectories (at minimum
 * `cache/`) out of Git while `config.yaml` and `runs/` are committed (PRD §4 req 4, 5).
 */
export const CASEWRIGHT_GITIGNORE = `# Casewright transient data — safe to delete, never committed.\ncache/\n`;

/** Serialize `.casewright/config.yaml` (PRD §4 req 3). Repo-wide config; no workspace list. */
export function serializeConfigYaml(cfg: Pick<ConfigYaml, 'version' | 'name'>): string {
  const lines = [`version: ${cfg.version}`];
  if (cfg.name && cfg.name.trim()) lines.push(`name: ${yamlScalar(cfg.name)}`);
  return lines.join('\n') + '\n';
}
