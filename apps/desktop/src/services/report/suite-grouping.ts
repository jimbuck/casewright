/**
 * Group a run's result rows by the owning suite of each case — the data behind the
 * report's per-suite "Test breakdown". Pure (no NW.js / Node) so it's unit-testable.
 *
 * A run is repo-level and can span suites/workspaces, so we bucket by the *live* case's
 * `suite` id (resolved to a display name via the suite tree), not by file path — matching
 * the "by case membership" rule the suite summary already uses. Rows whose case no longer
 * resolves to a live file fall into a single "Unknown / Deleted" bucket, listed last.
 *
 * Each suite carries the full roster of cases that ran under it (id, resolved title,
 * result, and a one-line output detail for non-passing rows) so the report can list every
 * test, not just per-suite totals.
 */
import type { Case, Result, Run, RunRow, TreeNode } from '@/types';
import { effectiveTestDate, rowFailures } from '@/utils/run-items';
import { resolveVariables } from '@/utils/variables';
import type { ReportCaseRow, ReportSuiteRow } from './run-report-html';

const UNKNOWN = 'Unknown / Deleted';

/** Walk the suite tree once into a `suiteId → display name` map. */
function suiteNames(tree: TreeNode[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (n.type === 'suite') {
        out.set(n.id, n.name);
        walk(n.children);
      }
    }
  };
  walk(tree);
  return out;
}

/** Resolve one run row to a roster entry — title with `{{today}}` resolved, plus a brief
 *  output detail (failed items + their notes, then any row note) for non-passing rows. */
function toCaseRow(run: Run, row: RunRow, kase: Case | undefined): ReportCaseRow {
  const td = effectiveTestDate(run, row);
  let detail = '';
  if (row.result !== 'pass') {
    const bits = rowFailures(row, kase).map((f) =>
      f.note ? `${resolveVariables(f.text, td)} — ${f.note}` : resolveVariables(f.text, td),
    );
    if (row.notes.trim()) bits.push(row.notes.trim());
    detail = bits.join(' · ');
  }
  return { display_id: row.display_id, title: resolveVariables(row.title, td), result: row.result, detail };
}

const zeroCounts = (): Record<Result, number> => ({ pass: 0, fail: 0, blocked: 0, skipped: 0, not_run: 0 });

/** Bucket a run's rows by suite, returning one breakdown row per suite (+ Unknown / Deleted). */
export function groupRunBySuite(run: Run, cases: Case[], tree: TreeNode[]): ReportSuiteRow[] {
  const byId = new Map(cases.map((c) => [c.id, c] as const));
  const names = suiteNames(tree);
  const buckets = new Map<string, ReportSuiteRow>();

  for (const row of run.rows) {
    const kase = byId.get(row.case_id);
    const name = kase ? names.get(kase.suite) ?? kase.suite : UNKNOWN;
    let b = buckets.get(name);
    if (!b) {
      b = { name, total: 0, counts: zeroCounts(), cases: [] };
      buckets.set(name, b);
    }
    b.total += 1;
    b.counts[row.result] += 1;
    b.cases.push(toCaseRow(run, row, kase));
  }

  return [...buckets.values()].sort((a, b) => {
    // Keep the Unknown / Deleted bucket last; everything else alphabetical by name.
    if (a.name === UNKNOWN) return 1;
    if (b.name === UNKNOWN) return -1;
    return a.name.localeCompare(b.name);
  });
}
