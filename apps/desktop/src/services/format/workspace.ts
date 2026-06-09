import type { Workspace } from '@/types';

function needsQuote(s: string): boolean {
  if (s === '' || s !== s.trim()) return true;
  if (/:( |$)/.test(s) || /\s#/.test(s) || /^#/.test(s)) return true;
  if (/^[!&*?{}[\]|>@`"'%,\-]/.test(s)) return true;
  return false;
}
const yamlScalar = (s: string): string => (needsQuote(s) ? JSON.stringify(s) : s);

/** Serialize the editable `workspace.yaml` fields (PRD §5.1). */
export function serializeWorkspaceYaml(ws: Pick<Workspace, 'name' | 'description' | 'prefix' | 'runsDir'>): string {
  const lines = [`name: ${yamlScalar(ws.name)}`];
  if (ws.description.trim()) lines.push(`description: ${yamlScalar(ws.description)}`);
  lines.push(`displayIdPrefix: ${yamlScalar(ws.prefix)}`);
  lines.push(`runsDir: ${yamlScalar(ws.runsDir)}`);
  return lines.join('\n') + '\n';
}
