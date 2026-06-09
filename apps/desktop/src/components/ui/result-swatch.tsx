import type { Result } from '@/types';
import { cn } from '@/lib/utils';

export interface ResultMeta {
  key: Result;
  label: string;
  glyph: string;
  color: string;
}

/** Result metadata — colors pair with glyphs for colorblind-safe signaling. */
export const RESULTS: ResultMeta[] = [
  { key: 'pass', label: 'Pass', glyph: '✓', color: 'var(--pass)' },
  { key: 'fail', label: 'Fail', glyph: '✕', color: 'var(--fail)' },
  { key: 'blocked', label: 'Blocked', glyph: '▢', color: 'oklch(0.5 0.13 66)' },
  { key: 'skipped', label: 'Skipped', glyph: '⤼', color: 'var(--skipped)' },
  { key: 'not_run', label: 'Not run', glyph: '·', color: 'var(--ink-3)' },
];

export const RES: Record<Result, ResultMeta> = Object.fromEntries(
  RESULTS.map((r) => [r.key, r]),
) as Record<Result, ResultMeta>;

const RESULT_CLASS: Record<Result, string> = {
  pass: 'text-pass bg-pass-soft border-[oklch(0.85_0.06_152)]',
  fail: 'text-fail bg-fail-soft border-[oklch(0.85_0.07_27)]',
  blocked: 'text-[oklch(0.5_0.13_66)] bg-blocked-soft border-[oklch(0.85_0.08_80)]',
  skipped: 'text-skipped bg-skipped-soft border-[oklch(0.85_0.04_285)]',
  not_run: 'text-ink-3 bg-notrun-soft border-border',
};

/** A single result swatch — color dot + label. */
export function ResultSwatch({ value }: { value: Result }) {
  const r = RES[value] ?? RES.not_run;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] whitespace-nowrap rounded-[5px] border px-2 py-0.5 font-mono text-[11px] font-semibold',
        RESULT_CLASS[value] ?? RESULT_CLASS.not_run,
      )}
    >
      <span className="size-2 shrink-0 rounded-[2px]" style={{ background: r.color }} />
      {r.label}
    </span>
  );
}
