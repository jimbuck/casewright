import type { Case } from '@/types';
import { slug } from '@/utils/ids';

/**
 * Canonical case filename: `<displayId>-<slug(title)>.md` (PRD §5.2),
 * e.g. `PAY-0042-user-can-reset-password.md`. Freely renamable since `id` is the key.
 */
export function caseFileName(c: Pick<Case, 'displayId' | 'title'>): string {
  const did = c.displayId.trim();
  const body = slug(c.title);
  const stem = [did, body].filter(Boolean).join('-') || 'untitled';
  return `${stem}.md`;
}

/** Canonical run filename stem: `<YYYY-MM-DD>-<slug(name)>` (PRD §5.4). */
export function runFileStem(name: string, date: string): string {
  const day = (date || '').slice(0, 10) || '0000-00-00';
  return `${day}-${slug(name) || 'run'}`;
}
