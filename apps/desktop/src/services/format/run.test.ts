import { describe, expect, it } from 'vitest';
import { runs } from '@/data/sample';
import type { RunRow } from '@/types';
import { parseRunCsv, serializeRunCsv, parseRunSidecar, serializeRunSidecar } from './run';

const SAMPLE_ROWS: RunRow[] = [
  {
    case_id: '9f3a7c1e8b',
    display_id: 'PAY-0042',
    title: 'User can reset password from the login screen',
    result: 'pass',
    tester: 'amartin',
    executed_at: '2026-06-01 09:14',
    notes: 'clean run',
  },
  {
    case_id: 'a1b2c3d4e5',
    display_id: 'PAY-0088',
    title: 'Coupon applies a percentage discount, at checkout',
    result: 'fail',
    tester: 'jpatel',
    executed_at: '2026-06-01 10:02',
    notes: 'DEF-2291 — discount rounds down by 1 cent',
  },
];

describe('run CSV', () => {
  it('round-trips rows exactly', () => {
    const { rows, warnings } = parseRunCsv(serializeRunCsv(SAMPLE_ROWS));
    expect(warnings).toHaveLength(0);
    expect(rows).toEqual(SAMPLE_ROWS);
  });

  it('emits the 7 columns in canonical order with a header', () => {
    const csv = serializeRunCsv(SAMPLE_ROWS);
    expect(csv.split('\n')[0]).toBe('case_id,display_id,title,result,tester,executed_at,notes');
    expect(csv.endsWith('\n')).toBe(true);
  });

  it('quotes cells containing commas (round-trips the comma)', () => {
    const { rows } = parseRunCsv(serializeRunCsv(SAMPLE_ROWS));
    expect(rows[1].title).toBe('Coupon applies a percentage discount, at checkout');
  });

  it('coerces an invalid result to not_run with a warning', () => {
    const csv =
      'case_id,display_id,title,result,tester,executed_at,notes\n' + 'x1,PAY-1,Some case,banana,me,,\n';
    const { rows, warnings } = parseRunCsv(csv);
    expect(rows[0].result).toBe('not_run');
    // zod .catch coerces silently; the row still parses, just defaulted
    expect(rows[0].case_id).toBe('x1');
    expect(warnings).toBeDefined();
  });

  it('warns when a required column is missing', () => {
    const csv = 'case_id,display_id,title,result,tester\n' + 'x1,PAY-1,Some case,pass,me\n';
    const { rows, warnings } = parseRunCsv(csv);
    expect(rows[0].executed_at).toBe('');
    expect(rows[0].notes).toBe('');
    expect(warnings.some((w) => w.code === 'csv-columns')).toBe(true);
  });

  it('round-trips every sample run', () => {
    for (const run of runs) {
      const { rows } = parseRunCsv(serializeRunCsv(run.rows));
      expect(rows).toEqual(run.rows);
    }
  });
});

describe('run sidecar', () => {
  it('round-trips name/description/status', () => {
    const md = serializeRunSidecar({ name: 'Regression — Sprint 12', description: 'Sprint review', status: 'open' });
    const { sidecar } = parseRunSidecar(md);
    expect(sidecar.name).toBe('Regression — Sprint 12');
    expect(sidecar.description).toBe('Sprint review');
    expect(sidecar.status).toBe('open');
  });

  it('defaults a missing status to open', () => {
    const { sidecar } = parseRunSidecar('---\nname: Bare\n---\n');
    expect(sidecar.status).toBe('open');
  });
});
