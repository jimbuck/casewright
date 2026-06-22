import type { Case, RunRow } from '@/types';
import { slug } from '@/utils/ids';

/**
 * Canonical case filename: `<slug(title)>.md`, e.g. `user-can-reset-password.md`.
 * The mutable `displayId` is deliberately *not* part of the name — baking it in renamed
 * the file (and churned Git) every time the id changed. Freely renamable since `id`
 * (in frontmatter) is the source of truth.
 */
export function caseFileName(c: Pick<Case, 'title'>): string {
  return `${slug(c.title) || 'untitled'}.md`;
}

/** Canonical run folder stem: `<YYYY-MM-DD>-<slug(name)>` (one folder per run). */
export function runFileStem(name: string, date: string): string {
  const day = (date || '').slice(0, 10) || '0000-00-00';
  return `${day}-${slug(name) || 'run'}`;
}

/**
 * Per-case sidecar filename within a run folder: `NNN-<display_id>-<slug(title)>.md`.
 * The 3-digit `seq` prefix keeps the results table in seed order across reloads.
 */
export function runCaseFileName(index: number, row: Pick<RunRow, 'display_id' | 'title'>): string {
  const seq = String(index + 1).padStart(3, '0');
  const stem = [row.display_id.trim(), slug(row.title)].filter(Boolean).join('-') || 'case';
  return `${seq}-${stem}.md`;
}
