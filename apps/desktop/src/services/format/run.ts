import { node } from '@/lib/node';
import { RUN_CSV_COLUMNS, RunRowSchema, RunSidecarSchema, type LintWarning, type RunSidecar } from '@/schemas';
import type { RunRow } from '@/types';

// ---------------------------------------------------------------------------
// CSV (the primary results store)
// ---------------------------------------------------------------------------

/** Serialize run rows to canonical CSV (7 columns in fixed order, trailing newline). */
export function serializeRunCsv(rows: RunRow[]): string {
  const Papa = node.papa();
  const csv = Papa.unparse({ fields: [...RUN_CSV_COLUMNS], data: rows }, { newline: '\n' });
  return csv.endsWith('\n') ? csv : csv + '\n';
}

export interface ParseRunCsvResult {
  rows: RunRow[];
  warnings: LintWarning[];
}

/** Parse run CSV → validated rows (PRD §5.4). Bad cells coerce with defaults + a warning. */
export function parseRunCsv(text: string): ParseRunCsvResult {
  const warnings: LintWarning[] = [];
  const Papa = node.papa();
  const res = Papa.parse<Record<string, unknown>>(text.trim(), { header: true, skipEmptyLines: true });

  const fields = res.meta?.fields ?? [];
  const missing = RUN_CSV_COLUMNS.filter((c) => !fields.includes(c));
  if (missing.length) warnings.push({ code: 'csv-columns', message: `CSV missing column(s): ${missing.join(', ')}.` });

  const rows: RunRow[] = res.data.map((raw, i) => {
    const parsed = RunRowSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    warnings.push({ code: 'csv-row', message: `Row ${i + 1} was invalid; coerced to defaults.` });
    return RunRowSchema.parse({});
  });

  return { rows, warnings };
}

// ---------------------------------------------------------------------------
// Sidecar `.md` (run metadata)
// ---------------------------------------------------------------------------

function needsQuote(s: string): boolean {
  if (s === '' || s !== s.trim()) return true;
  if (/:( |$)/.test(s) || /\s#/.test(s) || /^#/.test(s)) return true;
  if (/^[!&*?{}[\]|>@`"'%,\-]/.test(s)) return true;
  return false;
}
const yamlScalar = (s: string): string => (needsQuote(s) ? JSON.stringify(s) : s);

/** Serialize a run sidecar (`runs/<name>.md`) — front matter only (PRD §5.4). */
export function serializeRunSidecar(meta: { name: string; description?: string; status: 'open' | 'closed' }): string {
  const lines = ['---', `name: ${yamlScalar(meta.name)}`];
  if (meta.description) lines.push(`description: ${yamlScalar(meta.description)}`);
  lines.push(`status: ${meta.status}`, '---', '');
  return lines.join('\n');
}

export interface ParseRunSidecarResult {
  sidecar: RunSidecar;
  warnings: LintWarning[];
}

export function parseRunSidecar(text: string): ParseRunSidecarResult {
  const warnings: LintWarning[] = [];
  const data = (node.matter()(text).data ?? {}) as Record<string, unknown>;
  const parsed = RunSidecarSchema.safeParse(data);
  if (parsed.success) return { sidecar: parsed.data, warnings };
  warnings.push({ code: 'run-sidecar', message: 'Run sidecar front matter was invalid; coerced to defaults.' });
  return { sidecar: RunSidecarSchema.parse({}), warnings };
}
