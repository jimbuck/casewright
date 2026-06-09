import { z } from 'zod';

/** One CSV result row (PRD §5.4). Tolerant: invalid `result` coerces to `not_run`. */
export const RunRowSchema = z.object({
  case_id: z.coerce.string().default(''),
  display_id: z.coerce.string().default(''),
  title: z.coerce.string().default(''),
  result: z.enum(['not_run', 'pass', 'fail', 'blocked', 'skipped']).catch('not_run'),
  tester: z.coerce.string().default(''),
  executed_at: z.coerce.string().default(''),
  notes: z.coerce.string().default(''),
});

export type RunRowParsed = z.infer<typeof RunRowSchema>;

/** The 7 CSV columns, in canonical order (PRD §5.4). */
export const RUN_CSV_COLUMNS = [
  'case_id',
  'display_id',
  'title',
  'result',
  'tester',
  'executed_at',
  'notes',
] as const;

/** Run sidecar `runs/<name>.md` front matter (PRD §5.4). */
export const RunSidecarSchema = z.object({
  name: z.coerce.string().optional(),
  description: z.coerce.string().optional(),
  status: z.enum(['open', 'closed']).catch('open'),
});

export type RunSidecar = z.infer<typeof RunSidecarSchema>;
