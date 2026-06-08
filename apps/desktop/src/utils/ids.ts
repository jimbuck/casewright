import type { Run } from '@/types';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** A 10-char lowercase-alphanumeric id (stands in for a content hash). */
export function randomId(len = 10): string {
  return Array.from({ length: len }, () => ALPHABET[Math.floor(Math.random() * 36)]).join('');
}

/** Filename-safe slug from a title. */
export function slug(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

/** A deterministic-ish "now" stamp for the prototype's fixed demo date. */
export function nowStamp(): string {
  const d = new Date(2026, 5, 1, 11, 0 + Math.floor(Math.random() * 59));
  const p = (n: number) => String(n).padStart(2, '0');
  return `2026-06-01 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Index of the first not-yet-run row, or 0. */
export function firstUnrun(run: Run): number {
  const i = run.rows.findIndex((r) => r.result === 'not_run');
  return i === -1 ? 0 : i;
}
