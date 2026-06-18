import { describe, expect, it } from 'vitest';
import type { Case, Run, RunRow } from '@/types';
import { buildRunSummary } from '@/utils/run-items';
import { buildRunReportHtml, type ReportSuiteRow, type RunReportModel } from './run-report-html';

const kase: Case = {
  id: 'c1',
  displayId: 'PAY-0042',
  title: 'Reset password',
  status: 'active',
  tags: [],
  suite: 's1',
  objective: '',
  systems: [],
  setup: [],
  steps: [{ text: 'Submit reset', depth: 0 }],
  expected: ['Email arrives'],
  modified: false,
};

const failRow: RunRow = {
  case_id: 'c1',
  display_id: 'PAY-0042',
  title: 'Reset password',
  result: 'fail',
  tester: 'amartin',
  executed_at: '2026-06-09 14:19',
  notes: 'flaky on retry',
  checks: { 'step:0': 'fail', 'accept:0': 'fail' },
  failNotes: { 'step:0': 'button 500s', 'accept:0': 'never arrived' },
  itemText: {},
  file: '.casewright/runs/r1/001-PAY-0042.md',
};

const passRow: RunRow = {
  ...failRow,
  case_id: 'c2',
  display_id: 'PAY-0001',
  title: 'Login',
  result: 'pass',
  checks: {},
  failNotes: {},
  notes: '',
};

const run: Run = {
  id: '.casewright/runs/r1',
  name: 'Sprint 13',
  file: '.casewright/runs/r1',
  created: '2026-06-09',
  testDate: '2026-06-09',
  status: 'open',
  scope: 'tag: Smoke',
  rows: [failRow, passRow],
  summary: '',
  notes: '',
  testerApproval: { name: 'Sarah Kim', at: '2026-06-09 15:00' },
  reviewerApproval: null,
};

const suites: ReportSuiteRow[] = [
  {
    name: 'Authentication',
    total: 2,
    counts: { pass: 1, fail: 1, blocked: 0, skipped: 0, not_run: 0 },
    cases: [
      { display_id: 'PAY-0001', title: 'Login', result: 'pass', detail: '' },
      { display_id: 'PAY-0042', title: 'Reset password', result: 'fail', detail: 'button 500s' },
    ],
  },
  {
    name: 'Unknown / Deleted',
    total: 1,
    counts: { pass: 0, fail: 0, blocked: 0, skipped: 0, not_run: 1 },
    cases: [{ display_id: 'PAY-0099', title: 'Ghost case', result: 'not_run', detail: '' }],
  },
];

function buildModel(overrides: Partial<RunReportModel> = {}): RunReportModel {
  return {
    runName: run.name,
    status: run.status,
    created: run.created,
    testDate: run.testDate ?? run.created,
    repoName: 'casewright',
    generatedAt: '2026-06-12 09:30',
    summary: buildRunSummary(run, [kase]),
    suites,
    notes: run.notes,
    testerApproval: run.testerApproval,
    reviewerApproval: run.reviewerApproval,
    ...overrides,
  };
}

describe('buildRunReportHtml', () => {
  it('emits a self-contained HTML document with no scripts or external assets', () => {
    const html = buildRunReportHtml(buildModel());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>');
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/<link\b/);
  });

  it('renders the header metadata', () => {
    const html = buildRunReportHtml(buildModel());
    expect(html).toContain('Sprint 13');
    expect(html).not.toContain('Workspace'); // a run can span workspaces — omitted
    expect(html).not.toContain('Scope'); // removed from the header
    expect(html).toContain('casewright');
    expect(html).toContain('Jun 9, 2026'); // ISO dates rendered in a readable locale form
    expect(html).not.toContain('2026-06-09'); // ...not the raw sortable form
    expect(html).toContain('open');
  });

  it('shows completion in the progress bar, pass rate on the tile, one segment per non-zero result', () => {
    const model = buildModel({ suites: [] }); // 1 pass + 1 fail → 2/2 completed, 1/2 passed
    const html = buildRunReportHtml(model);
    expect(html).toContain('100% <small>complete</small>'); // both cases reached a verdict
    expect(html).toContain('50% pass rate'); // 1 of 2 completed passed
    const nonZero = Object.values(model.summary.counts).filter((n) => n > 0).length;
    expect(nonZero).toBe(2); // 1 pass + 1 fail
    // suites:[] above isolates the overall bar — its segments are the only ones here
    expect((html.match(/class="seg"/g) ?? []).length).toBe(nonZero);
  });

  it('does not count blocked or skipped as completed, and pass rate is of completed only', () => {
    const r: Run = {
      ...run,
      rows: [
        passRow, // pass
        { ...passRow, case_id: 'c3', display_id: 'PAY-0003', title: 'Refund', result: 'blocked', notes: 'gateway down' },
      ],
    };
    const html = buildRunReportHtml(buildModel({ summary: buildRunSummary(r, [kase]), suites: [] }));
    expect(html).toContain('50% <small>complete</small>'); // 1 of 2 reached a verdict (blocked ≠ done)
    expect(html).toContain('50% of plan'); // Completed tile sub
    expect(html).toContain('100% pass rate'); // 1 pass of 1 completed — blocked excluded from denominator
  });

  it('lists every case under its suite in the test breakdown, including Unknown / Deleted', () => {
    const html = buildRunReportHtml(buildModel());
    expect(html).toContain('Test breakdown');
    expect(html).toContain('Authentication');
    expect(html).toContain('Unknown / Deleted');
    // each suite's individual cases are listed with id + title
    expect(html).toContain('PAY-0001');
    expect(html).toContain('Login');
    expect(html).toContain('PAY-0099');
    expect(html).toContain('Ghost case');
    expect(html).toContain('2 cases · 1 pass · 1 fail'); // suite tally line
  });

  it('lists failed/blocked cases with their failed items and notes', () => {
    const html = buildRunReportHtml(buildModel());
    expect(html).toContain('PAY-0042');
    expect(html).toContain('button 500s');
    expect(html).toContain('never arrived');
    expect(html).toContain('flaky on retry'); // row notes
  });

  it('renders the tester sign-off and an awaiting placeholder for the missing reviewer', () => {
    const html = buildRunReportHtml(buildModel());
    expect(html).toContain('Sarah Kim');
    expect(html).toContain('Jun 9, 2026, 3:00 PM'); // approval timestamp, readable form
    expect(html).toContain('Awaiting sign-off');
  });

  it('shows an empty-state note when the run has no cases', () => {
    const empty = buildModel({ summary: buildRunSummary({ ...run, rows: [] }, [kase]), suites: [] });
    const html = buildRunReportHtml(empty);
    expect(html).toContain('No cases in this run.');
    expect(html).not.toContain('Test breakdown');
  });

  it('HTML-escapes free-text fields (injection / broken-markup guard)', () => {
    const html = buildRunReportHtml(buildModel({ runName: 'Reset <b> & "x"' }));
    expect(html).not.toContain('Reset <b>');
    expect(html).toContain('Reset &lt;b&gt; &amp; &quot;x&quot;');
  });

  it('renders markdown in run notes, failure notes, and row notes (but not in titles/names)', () => {
    const r: Run = {
      ...run,
      notes: 'Run-level **summary** note',
      rows: [
        {
          ...failRow,
          failNotes: { 'step:0': '`500` from *gateway*', 'accept:0': 'never arrived' },
          notes: 'see [ticket](https://x.io)',
        },
      ],
    };
    const html = buildRunReportHtml(
      buildModel({ notes: r.notes, summary: buildRunSummary(r, [kase]), suites: [] }),
    );
    expect(html).toContain('<h2>Notes</h2>');
    expect(html).toContain('<strong>summary</strong>'); // run-level notes
    expect(html).toContain('<code>500</code>'); // failure-note inline code
    expect(html).toContain('<em>gateway</em>'); // failure-note emphasis
    expect(html).toContain('<a href="https://x.io">ticket</a>'); // row-note link
  });

  it('keeps case titles escaped even though their detail renders markdown', () => {
    const html = buildRunReportHtml(
      buildModel({
        suites: [
          {
            name: 'Auth',
            total: 1,
            counts: { pass: 0, fail: 1, blocked: 0, skipped: 0, not_run: 0 },
            cases: [{ display_id: 'X-1', title: 'Title <b>raw</b>', result: 'fail', detail: 'failed **hard**' }],
          },
        ],
      }),
    );
    expect(html).toContain('Title &lt;b&gt;raw&lt;/b&gt;'); // title stays escaped
    expect(html).toContain('failed <strong>hard</strong>'); // detail renders markdown
  });
});
