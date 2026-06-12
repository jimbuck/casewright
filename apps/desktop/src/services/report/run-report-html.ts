/**
 * Pure builder for a single test run's PDF report — turns a plain data model into a
 * fully self-contained HTML string (one inline `<style>`, no external assets, no JS).
 *
 * It stays free of React, NW.js, and Node so it can be unit-tested directly and so the
 * hidden print window renders it identically without the app's Vite/Tailwind pipeline.
 * The CSS defines its OWN `:root` custom properties (the app's `var(--…)` tokens don't
 * exist in the print window), inlining the literal oklch values from `@casewright/brand`.
 */
import type { RunSummary, RunSummaryEntry } from '@/utils/run-items';
import type { Approval, Result } from '@/types';

/** One test case that ran under a suite, for the breakdown roster. */
export interface ReportCaseRow {
  display_id: string;
  title: string;
  result: Result;
  /** A one-line output detail (failed items + notes) for non-passing rows; '' for pass. */
  detail: string;
}

/** One suite in the test breakdown: its result distribution plus the roster of cases. */
export interface ReportSuiteRow {
  name: string;
  total: number;
  /** Per-result counts, for the suite's distribution bar and tally. */
  counts: Record<Result, number>;
  /** Every case that ran under this suite, in run order. */
  cases: ReportCaseRow[];
}

/** Everything the report renders — assembled by the orchestrator, consumed purely here. */
export interface RunReportModel {
  runName: string;
  status: 'open' | 'closed';
  created: string;
  testDate: string;
  repoName: string;
  /** `YYYY-MM-DD HH:MM` stamp for the footer. */
  generatedAt: string;
  summary: RunSummary;
  suites: ReportSuiteRow[];
  testerApproval: Approval | null;
  reviewerApproval: Approval | null;
}

const RESULT_META: Record<Result, { label: string; color: string }> = {
  pass: { label: 'Pass', color: 'var(--pass)' },
  fail: { label: 'Fail', color: 'var(--fail)' },
  blocked: { label: 'Blocked', color: 'var(--blocked)' },
  skipped: { label: 'Skipped', color: 'var(--skipped)' },
  not_run: { label: 'Not run', color: 'var(--notrun)' },
};

const SEG_ORDER: Result[] = ['pass', 'fail', 'blocked', 'skipped', 'not_run'];

/** HTML-escape a free-text value — run/case data can contain `<`, `&`, quotes. */
function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const pct = (n: number, of: number): number => (of ? Math.round((n / of) * 100) : 0);

/** A "completed" test reached a pass or fail verdict — blocked / skipped / not-run did not.
 *  Progress and pass rate are measured against this, not against everything-but-not-run. */
const completedCount = (counts: Record<Result, number>): number => counts.pass + counts.fail;

/** Format an ISO `YYYY-MM-DD` as a readable date, e.g. `Jun 1, 2026`. Parts are read
 *  explicitly (not `new Date(iso)`) to avoid UTC-vs-local day shifts. Unparseable → raw. */
function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso ?? '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Format a `YYYY-MM-DD HH:MM` stamp as `Jun 12, 2026, 2:27 PM` (date-only when no time). */
function fmtStamp(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s ?? '');
  if (!m) return s ?? '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? '0'), Number(m[5] ?? '0'));
  const date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  if (m[4] === undefined) return date;
  return `${date}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function statusBadge(status: 'open' | 'closed'): string {
  const cls = status === 'open' ? 'badge badge-open' : 'badge badge-closed';
  return `<span class="${cls}">${esc(status)}</span>`;
}

function renderHead(m: RunReportModel): string {
  // No "Workspace" (a run can span workspaces) and no "Scope". The generated stamp lives
  // only in the footer now, not duplicated here.
  const meta: Array<[string, string]> = [
    ['Repository', m.repoName || '—'],
    ['Created', fmtDate(m.created) || '—'],
    ['Test date', fmtDate(m.testDate) || '—'],
  ];
  return `
  <header class="head">
    <div class="eyebrow">Test run report</div>
    <h1>${esc(m.runName) || 'Untitled run'} ${statusBadge(m.status)}</h1>
    <dl class="meta">
      ${meta.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
    </dl>
  </header>`;
}

function renderTiles(m: RunReportModel): string {
  const { counts, total } = m.summary;
  const done = completedCount(counts); // pass + fail — the only "completed" tests
  const tiles: Array<{ label: string; value: number; sub: string; color?: string }> = [
    { label: 'Total cases', value: total, sub: `${m.suites.length} suite${m.suites.length === 1 ? '' : 's'}` },
    { label: 'Completed', value: done, sub: `${pct(done, total)}% of plan` },
    { label: 'Passed', value: counts.pass, sub: `${pct(counts.pass, done)}% pass rate`, color: 'var(--pass)' },
    { label: 'Failed', value: counts.fail, sub: `${pct(counts.fail, done)}% of completed`, color: 'var(--fail)' },
    { label: 'Blocked', value: counts.blocked, sub: counts.blocked ? 'not completed' : 'none', color: 'var(--blocked)' },
    { label: 'Not run', value: counts.not_run, sub: `${pct(counts.not_run, total)}% remaining` },
  ];
  return `
  <section class="tiles">
    ${tiles
      .map(
        (t) => `
      <div class="tile">
        <div class="tile-num" ${t.color ? `style="color:${t.color}"` : ''}>${t.value}</div>
        <div class="tile-label">${esc(t.label)}</div>
        <div class="tile-sub">${esc(t.sub)}</div>
      </div>`,
      )
      .join('')}
  </section>`;
}

/**
 * Inner HTML for a segmented result-distribution bar (each segment flex-grows by its count,
 * colored per result). `showNumbers` prints the count inside each segment — on for the big
 * overall bar, off for the small per-suite bars.
 */
function barSegments(counts: Record<Result, number>, showNumbers: boolean): string {
  const segs = SEG_ORDER.filter((r) => counts[r] > 0)
    .map((r) => {
      const onLight = r === 'not_run' || r === 'skipped';
      const text = showNumbers ? String(counts[r]) : '';
      return `<span class="seg" style="flex-grow:${counts[r]};background:${RESULT_META[r].color};color:${
        onLight ? 'var(--ink-2)' : 'oklch(1 0 0 / 0.92)'
      }">${text}</span>`;
    })
    .join('');
  if (segs) return segs;
  const total = SEG_ORDER.reduce((n, r) => n + counts[r], 0);
  return `<span class="seg" style="flex-grow:1;background:var(--sunken);color:var(--ink-3)">${showNumbers ? total : ''}</span>`;
}

function renderBar(m: RunReportModel): string {
  const { counts, total } = m.summary;
  const completion = pct(completedCount(counts), total); // share of the plan run to a verdict
  const legend = SEG_ORDER.filter((r) => counts[r] > 0)
    .map(
      (r) =>
        `<span class="chip"><span class="dot" style="background:${RESULT_META[r].color}"></span><b>${counts[r]}</b> ${esc(
          RESULT_META[r].label,
        )}</span>`,
    )
    .join('');
  return `
  <section class="bar-block">
    <div class="bar-head">
      <h2>Overall progress</h2>
      <span class="bar-pct" style="color:var(--accent)">${completion}% <small>complete</small></span>
    </div>
    <div class="bar">${barSegments(counts, true)}</div>
    <div class="legend">${legend}</div>
  </section>`;
}

function renderCaseRow(c: ReportCaseRow): string {
  const meta = RESULT_META[c.result];
  return `
        <tr class="case-row">
          <td class="case-id mono">${esc(c.display_id)}</td>
          <td class="case-title">${esc(c.title)}${
            c.detail ? `<div class="case-detail">${esc(c.detail)}</div>` : ''
          }</td>
          <td class="case-result"><span class="dot" style="background:${meta.color}"></span><span style="color:${
            meta.color
          }">${esc(meta.label)}</span></td>
        </tr>`;
}

function renderSuiteGroup(s: ReportSuiteRow): string {
  const tally = SEG_ORDER.filter((r) => s.counts[r] > 0)
    .map((r) => `${s.counts[r]} ${RESULT_META[r].label.toLowerCase()}`)
    .join(' · ');
  return `
    <div class="suite-group">
      <div class="suite-group-head">
        <div class="suite-group-title">
          <span class="suite-group-name">${esc(s.name)}</span>
          <span class="suite-group-tally">${s.total} case${s.total === 1 ? '' : 's'}${
            tally ? ` · ${esc(tally)}` : ''
          }</span>
        </div>
        <div class="suite-group-progress"><div class="bar suite-bar">${barSegments(s.counts, false)}</div></div>
      </div>
      <table class="case-table"><tbody>${s.cases.map(renderCaseRow).join('')}</tbody></table>
    </div>`;
}

function renderSuiteBreakdown(suites: ReportSuiteRow[]): string {
  if (!suites.length) return '';
  return `
  <section>
    <h2>Test breakdown</h2>
    ${suites.map(renderSuiteGroup).join('')}
  </section>`;
}

function renderAttention(entries: RunSummaryEntry[]): string {
  if (!entries.length) {
    return `<section><h2>Needs attention</h2><div class="ok-note">No failed or blocked cases.</div></section>`;
  }
  const items = entries
    .map((e) => {
      const failures = e.failures.length
        ? `<ul class="fails">${e.failures
            .map(
              (f) =>
                `<li>${esc(f.text)}${f.note ? ` <span class="muted">— ${esc(f.note)}</span>` : ''}</li>`,
            )
            .join('')}</ul>`
        : '';
      const notes = e.notes ? `<div class="attn-notes">${esc(e.notes)}</div>` : '';
      // Show both the failed items and any free-text note (matches RunGrid's AttentionRow).
      const detail = failures + notes || `<div class="muted">No failure detail recorded.</div>`;
      return `
      <div class="attn">
        <div class="attn-head">
          <span class="dot" style="background:${RESULT_META[e.result].color}"></span>
          <span class="mono attn-id">${esc(e.display_id)}</span>
          <span class="attn-title">${esc(e.title)}</span>
          <span class="attn-result" style="color:${RESULT_META[e.result].color}">${esc(RESULT_META[e.result].label)}</span>
        </div>
        ${detail}
      </div>`;
    })
    .join('');
  return `<section><h2>Needs attention (${entries.length})</h2>${items}</section>`;
}

function renderPassed(entries: RunSummaryEntry[]): string {
  if (!entries.length) return '';
  const items = entries
    .map(
      (e) =>
        `<li><span class="mono passed-id">${esc(e.display_id)}</span><span class="passed-title">${esc(e.title)}</span></li>`,
    )
    .join('');
  return `<section><h2>Passed (${entries.length})</h2><ul class="passed">${items}</ul></section>`;
}

function renderApprovalCard(label: string, a: Approval | null): string {
  const body = a
    ? `<div class="approved"><span class="approver">${esc(a.name)}</span><span class="mono approved-at">${esc(
        fmtStamp(a.at),
      )}</span></div>`
    : `<div class="awaiting">Awaiting sign-off</div>`;
  return `
    <div class="signoff-card">
      <div class="signoff-label">${esc(label)}</div>
      ${body}
    </div>`;
}

function renderSignoff(m: RunReportModel): string {
  return `
  <section>
    <h2>Sign-off</h2>
    <div class="signoff">
      ${renderApprovalCard('Tester', m.testerApproval)}
      ${renderApprovalCard('Reviewer', m.reviewerApproval)}
    </div>
  </section>`;
}

const STYLE = `
:root{
  --bg:oklch(0.972 0.004 80);--panel:oklch(0.995 0.002 85);--panel-2:oklch(0.980 0.004 80);
  --sunken:oklch(0.958 0.006 75);--border:oklch(0.905 0.005 75);--border-2:oklch(0.855 0.006 72);
  --ink:oklch(0.28 0.012 60);--ink-2:oklch(0.46 0.010 60);--ink-3:oklch(0.60 0.008 62);--ink-faint:oklch(0.72 0.006 64);
  --accent:oklch(0.55 0.13 283);--accent-soft:oklch(0.952 0.028 283);--accent-ink:oklch(0.46 0.12 283);
  --pass:oklch(0.58 0.12 152);--fail:oklch(0.56 0.19 27);--blocked:oklch(0.62 0.16 52);
  --skipped:oklch(0.60 0.008 65);--notrun:oklch(0.90 0.003 80);
  --font-ui:"IBM Plex Sans",system-ui,-apple-system,sans-serif;
  --font-mono:"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,monospace;
}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{font-family:var(--font-ui);color:var(--ink);background:#fff;font-size:13px;line-height:1.5;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;}
@page{margin:14mm;}
.report{max-width:840px;margin:0 auto;}
.mono{font-family:var(--font-mono);}
.muted{color:var(--ink-3);}
h1{font-size:23px;font-weight:600;margin:2px 0 0;letter-spacing:-0.01em;}
h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-2);
  margin:0 0 10px;padding-bottom:7px;border-bottom:1px solid var(--border);break-after:avoid;}
section{margin-top:22px;}
.dot{display:inline-block;width:9px;height:9px;border-radius:3px;flex:0 0 auto;}

/* header */
.head{border-bottom:2px solid var(--border-2);padding-bottom:16px;}
.eyebrow{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--ink-faint);}
.badge{display:inline-block;vertical-align:middle;font-size:10.5px;font-weight:700;text-transform:uppercase;
  letter-spacing:0.05em;padding:2px 9px;border-radius:999px;margin-left:6px;}
.badge-open{background:var(--accent-soft);color:var(--accent-ink);}
.badge-closed{background:var(--sunken);color:var(--ink-3);}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px 20px;margin:16px 0 0;}
.meta dt{font-size:10.5px;text-transform:uppercase;letter-spacing:0.05em;color:var(--ink-faint);margin:0;}
.meta dd{margin:2px 0 0;font-size:13px;font-weight:500;color:var(--ink);}

/* stat tiles */
/* Six fixed columns so the tiles always stay on one row (minmax(0,1fr) lets them
   shrink to fit narrow pages instead of wrapping one onto a second line). */
.tiles{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-top:18px;}
.tile{border:1px solid var(--border);background:var(--panel-2);border-radius:9px;padding:11px 11px;break-inside:avoid;}
.tile-num{font-size:25px;font-weight:700;line-height:1;letter-spacing:-0.02em;}
.tile-label{margin-top:7px;font-size:11.5px;font-weight:600;color:var(--ink-2);}
.tile-sub{margin-top:2px;font-size:10px;color:var(--ink-faint);}

/* progress bar */
.bar-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;}
.bar-head h2{margin:0;padding:0;border:0;}
.bar-pct{font-size:20px;font-weight:700;}
.bar-pct small{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--ink-faint);}
.bar{display:flex;height:30px;border:1px solid var(--border);border-radius:7px;overflow:hidden;}
.seg{display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:11px;font-weight:700;min-width:24px;}
.legend{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px;}
.chip{display:inline-flex;align-items:center;gap:6px;background:var(--sunken);border-radius:999px;
  padding:3px 10px;font-size:11.5px;color:var(--ink-2);}
.chip b{font-weight:700;color:var(--ink);}

/* test breakdown — one group per suite, then every case that ran under it */
.suite-group{margin-bottom:18px;break-inside:avoid;}
.suite-group-head{display:flex;align-items:center;gap:14px;padding:6px 0 8px;border-bottom:1.5px solid var(--border-2);}
.suite-group-title{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1;}
.suite-group-name{font-size:14.5px;font-weight:600;}
.suite-group-tally{font-family:var(--font-mono);font-size:10.5px;color:var(--ink-faint);}
.suite-group-progress{width:170px;flex:0 0 auto;}
/* Same segmented color coding as the overall bar, just smaller and without numbers. */
.suite-bar{height:9px;border-radius:5px;}
.suite-bar .seg{min-width:0;}
.case-table{width:100%;border-collapse:collapse;font-size:12.5px;}
.case-row{break-inside:avoid;}
.case-row td{padding:6px 0;border-bottom:1px solid var(--border);vertical-align:top;}
.case-row:last-child td{border-bottom:0;}
.case-id{width:88px;white-space:nowrap;color:var(--ink-3);font-size:11px;}
.case-title{font-weight:500;padding-right:12px;}
.case-detail{margin-top:3px;font-size:11.5px;font-weight:400;color:var(--ink-3);line-height:1.45;}
.case-result{width:92px;white-space:nowrap;text-align:right;font-family:var(--font-mono);font-size:11px;font-weight:700;}
.case-result .dot{margin-right:4px;vertical-align:middle;}

/* needs attention */
.ok-note{color:var(--pass);font-size:12.5px;}
.attn{border:1px solid var(--border);background:var(--panel-2);border-radius:8px;padding:10px 12px;margin-bottom:8px;break-inside:avoid;}
.attn-head{display:flex;align-items:center;gap:8px;}
.attn-id{font-size:11px;color:var(--ink-3);}
.attn-title{font-size:13px;font-weight:600;}
.attn-result{margin-left:auto;font-family:var(--font-mono);font-size:11px;font-weight:700;}
.fails{margin:8px 0 0;padding-left:18px;}
.fails li{font-size:12.5px;line-height:1.45;color:var(--ink-2);margin-bottom:2px;}
.attn-notes{margin-top:6px;font-size:12px;font-style:italic;color:var(--ink-3);}

/* passed list */
.passed{list-style:none;margin:0;padding:0;columns:2;column-gap:24px;}
.passed li{display:flex;align-items:baseline;gap:8px;font-size:12px;color:var(--ink-2);margin-bottom:3px;break-inside:avoid;}
.passed-id{font-size:10.5px;color:var(--ink-faint);flex:0 0 auto;}
.passed-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* sign-off */
.signoff{display:flex;gap:14px;flex-wrap:wrap;}
.signoff-card{flex:1;min-width:200px;border:1px solid var(--border);border-radius:9px;padding:14px;break-inside:avoid;}
.signoff-label{font-size:10.5px;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-faint);}
.approved{margin-top:10px;display:flex;align-items:baseline;gap:10px;}
.approver{font-size:15px;font-weight:700;}
.approved-at{font-size:11.5px;color:var(--ink-faint);}
.awaiting{margin-top:10px;font-size:13px;font-style:italic;color:var(--ink-3);}

/* footer */
.footer{margin-top:26px;padding-top:12px;border-top:1px solid var(--border);
  font-size:10.5px;color:var(--ink-faint);text-align:center;}
.empty{margin-top:20px;border:1px dashed var(--border-2);border-radius:9px;padding:24px;text-align:center;color:var(--ink-3);}
`;

/** Build the complete, self-contained report HTML document for one run. */
export function buildRunReportHtml(model: RunReportModel): string {
  const empty = model.summary.total === 0;
  const body = empty
    ? `<div class="empty">No cases in this run.</div>`
    : [
        renderTiles(model),
        renderBar(model),
        renderSuiteBreakdown(model.suites),
        renderAttention(model.summary.attention),
        renderPassed(model.summary.passed),
      ].join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(model.runName)} — Test run report</title>
<style>${STYLE}</style>
</head>
<body>
<div class="report">
${renderHead(model)}
${body}
${renderSignoff(model)}
<div class="footer">Generated by Casewright · ${esc(fmtStamp(model.generatedAt))}</div>
</div>
</body>
</html>`;
}
