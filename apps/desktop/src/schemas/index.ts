export { RootConfigSchema, type RootConfig } from './config';
export { WorkspaceYamlSchema, type WorkspaceYaml } from './workspace';
export { CaseFrontMatterSchema, type CaseFrontMatter } from './case';
export { SuiteFrontMatterSchema, type SuiteFrontMatter } from './suite';
export { RunRowSchema, RunSidecarSchema, RUN_CSV_COLUMNS, type RunRowParsed, type RunSidecar } from './run';

/**
 * A non-blocking import/parse warning (PRD §5.2 tolerance). Surfaced in the UI,
 * never thrown — malformed disk content is coerced with defaults and flagged.
 */
export interface LintWarning {
  code: string;
  message: string;
  file?: string;
}
