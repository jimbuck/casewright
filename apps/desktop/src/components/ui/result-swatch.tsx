import type { Result } from '@/types';

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

/** A single result swatch — color dot + label. */
export function ResultSwatch({ value }: { value: Result }) {
  const r = RES[value] ?? RES.not_run;
  return (
    <span className={`res res-${value}`}>
      <span className="dot" style={{ background: r.color }} />
      {r.label}
    </span>
  );
}
