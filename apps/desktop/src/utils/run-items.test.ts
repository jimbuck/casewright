import { describe, expect, it } from 'vitest';
import type { Case, Run, RunRow } from '@/types';
import { buildDefectText, deriveItems } from './run-items';

const kase: Case = {
  id: 'c1',
  displayId: 'PAY-0042',
  title: 'Reset password',
  status: 'active',
  tags: [],
  suite: 's1',
  objective: 'Verify the self-service reset flow.',
  systems: ['Auth service'],
  setup: [],
  steps: [
    { text: 'Open login', depth: 0 },
    { text: 'Click forgot password', depth: 0 },
  ],
  expected: ['Email arrives'],
  modified: false,
};

const baseRow: RunRow = {
  case_id: 'c1',
  display_id: 'PAY-0042',
  title: 'Reset password',
  result: 'fail',
  tester: 'amartin',
  executed_at: '2026-06-09 14:19',
  notes: 'see below',
  checks: { 'setup:0': 'pass', 'step:0': 'pass', 'step:1': 'fail', 'accept:0': 'fail' },
  failNotes: { 'step:1': 'button 500s', 'accept:0': 'never arrived' },
  itemText: {},
  file: '.casewright/runs/r1/001-PAY-0042-reset-password.md',
};

const run: Run = {
  id: '.casewright/runs/r1',
  name: 'Sprint 13',
  file: '.casewright/runs/r1',
  created: '2026-06-09',
  status: 'open',
  scope: 'repo',
  rows: [baseRow],
  summary: '',
  notes: '',
  testerApproval: null,
  reviewerApproval: null,
};

describe('deriveItems', () => {
  it('produces stable positional keys', () => {
    const d = deriveItems(kase);
    expect(d.setup.map((i) => i.key)).toEqual(['setup:0']);
    expect(d.steps.map((i) => i.key)).toEqual(['step:0', 'step:1']);
    expect(d.accept.map((i) => i.key)).toEqual(['accept:0']);
    expect(d.steps[1].num).toBe('2');
  });

  it('returns empty groups for a missing case', () => {
    expect(deriveItems(undefined)).toEqual({ setup: [], steps: [], accept: [] });
  });
});

describe('buildDefectText', () => {
  it('lists only failed items with their notes and references the run', () => {
    const text = buildDefectText(run, baseRow, kase);
    expect(text).toContain('# PAY-0042 — Reset password');
    expect(text).toContain('**Objective:** Verify the self-service reset flow.');
    expect(text).toContain('Sprint 13 (.casewright/runs/r1)');
    expect(text).toContain('## Failed steps');
    expect(text).toContain('- 2. Click forgot password — button 500s');
    expect(text).toContain('- Email arrives — never arrived');
    expect(text).not.toContain('Open login'); // passing step is omitted
  });

  it('falls back to snapshot text when the live case is gone', () => {
    const row: RunRow = { ...baseRow, itemText: { 'step:1': 'Click forgot password' } };
    const text = buildDefectText(run, row, undefined);
    expect(text).toContain('- Click forgot password — button 500s');
  });
});
