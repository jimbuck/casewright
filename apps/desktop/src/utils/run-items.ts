import type { Case, Result, Run, RunRow } from '@/types';
import { numberSteps } from '@/utils/steps';

/** One checklist row in the run guide — positional `key`, display `text`, optional number/indent. */
export interface ChecklistItem {
  key: string;
  text: string;
  num?: string;
  depth?: number;
}

export interface DerivedItems {
  setup: ChecklistItem[];
  steps: ChecklistItem[];
  accept: ChecklistItem[];
}

/**
 * Derive the run checklist from a live case — the single source of truth for item
 * keys/text shared by the guide UI and the per-case sidecar writer. Keys are
 * positional (`setup:i` / `step:i` / `accept:i`), matching the sidecar encoding.
 */
export function deriveItems(kase: Case | undefined): DerivedItems {
  if (!kase) return { setup: [], steps: [], accept: [] };
  const stepNums = numberSteps(kase.steps);
  return {
    setup: kase.systems.map((sys, i) => ({ key: `setup:${i}`, text: `Confirm ${sys} is available and reachable.` })),
    steps: kase.steps.map((s, i) => ({ key: `step:${i}`, text: s.text, num: stepNums[i], depth: s.depth })),
    accept: kase.expected.map((t, i) => ({ key: `accept:${i}`, text: t })),
  };
}

const RESULT_LABEL: Record<Result, string> = {
  pass: 'Pass',
  fail: 'Fail',
  blocked: 'Blocked',
  skipped: 'Skipped',
  not_run: 'Not run',
};

/**
 * Build a copy-pasteable defect report for a non-passing case: title, objective,
 * a reference back to the run, and every checklist item marked `fail` with its
 * failure description. Falls back to the snapshot `itemText` when the live case is gone.
 */
export function buildDefectText(run: Run, row: RunRow, kase: Case | undefined): string {
  const lines: string[] = [`# ${row.display_id} — ${row.title}`];
  if (kase?.objective.trim()) lines.push('', `**Objective:** ${kase.objective.trim()}`);
  lines.push('', `**Run:** ${run.name} (${run.file})`);
  lines.push(`**Result:** ${RESULT_LABEL[row.result]} · Tester: ${row.tester || '—'} · ${row.executed_at || '—'}`);

  // Resolve display text for each key from the live case, then snapshot fallback.
  const label: Record<string, string> = {};
  const order: string[] = [];
  const { setup, steps, accept } = deriveItems(kase);
  [...setup, ...steps, ...accept].forEach((it) => {
    label[it.key] = (it.num ? `${it.num}. ` : '') + it.text;
    order.push(it.key);
  });
  for (const k of Object.keys(row.checks)) if (!order.includes(k)) order.push(k);

  const failed = order.filter((k) => row.checks[k] === 'fail');
  if (failed.length) {
    lines.push('', '## Failed steps');
    for (const k of failed) {
      const text = label[k] ?? row.itemText?.[k] ?? k;
      const note = (row.failNotes[k] ?? '').trim();
      lines.push(`- ${text}${note ? ` — ${note}` : ''}`);
    }
  }
  if (row.notes.trim()) lines.push('', '## Notes', row.notes.trim());
  return lines.join('\n');
}
