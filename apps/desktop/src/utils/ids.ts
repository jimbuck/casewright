import { customAlphabet } from 'nanoid';
import type { Run } from '@/types';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const gen11 = customAlphabet(ALPHABET, 11);

/** A stable lowercase-alphanumeric case id (~11 chars, `[a-z0-9]`; PRD §5.2). */
export function randomId(len = 11): string {
  return len === 11 ? gen11() : customAlphabet(ALPHABET, len)();
}

/** Filename-safe slug from a title. */
export function slug(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

/** A `YYYY-MM-DD HH:MM` timestamp for the current moment (run `executed_at`). */
export function nowStamp(): string {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

/** Index of the first not-yet-run row, or 0. */
export function firstUnrun(run: Run): number {
  const i = run.rows.findIndex((r) => r.result === 'not_run');
  return i === -1 ? 0 : i;
}
