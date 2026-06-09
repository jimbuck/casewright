export { ConfigYamlSchema, type ConfigYaml } from './config';
export { WorkspaceYamlSchema, type WorkspaceYaml } from './workspace';
export { CaseFrontMatterSchema, type CaseFrontMatter } from './case';
export { SuiteFrontMatterSchema, type SuiteFrontMatter } from './suite';
export {
  CheckStateSchema,
  ApprovalSchema,
  RunDetailsFrontSchema,
  RunCaseFrontSchema,
  type RunDetailsFront,
  type RunCaseFront,
} from './run';

/**
 * A non-blocking import/parse warning (PRD §5.2 tolerance). Surfaced in the UI,
 * never thrown — malformed disk content is coerced with defaults and flagged.
 */
export interface LintWarning {
  code: string;
  message: string;
  file?: string;
}
