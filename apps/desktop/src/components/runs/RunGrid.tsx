import { useState } from 'react';
import { I } from '@/components/icons';
import { Button, Input, RES, RESULTS, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app-store';
import { firstUnrun, nowStamp } from '@/utils/ids';
import type { Approval, Result, RunRow } from '@/types';
import { NotesCell } from './NotesCell';

/** A tester/reviewer approval control: shows the stamp when set, else a name + approve button. */
function ApprovalCard({
  label,
  approval,
  defaultName,
  onApprove,
  onClear,
}: {
  label: string;
  approval: Approval | null;
  defaultName: string;
  onApprove: (name: string) => void;
  onClear: () => void;
}) {
  const [name, setName] = useState(defaultName);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-panel p-[14px]">
      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">{label}</div>
      {approval ? (
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-pass">{I.check({ size: 14 })} {approval.name}</span>
          <span className="font-mono text-[11.5px] text-ink-faint">{approval.at}</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear}>
            {I.x({ size: 12 })} Clear
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input className="flex-1" mono value={name} placeholder="Your name" onChange={(e) => setName(e.target.value)} />
          <Button variant="primary" size="sm" disabled={!name.trim()} onClick={() => onApprove(name.trim())}>
            {I.check({ size: 13 })} Approve
          </Button>
        </div>
      )}
    </div>
  );
}

type Tally = Record<Result, number>;
const SEGS: Result[] = ['pass', 'fail', 'blocked', 'skipped', 'not_run'];

const RUN_STATUS: Record<string, string> = {
  open: 'text-accent-ink bg-accent-soft',
  closed: 'text-ink-3 bg-sunken',
};

const cellInput =
  'w-full rounded-sm border border-transparent bg-transparent px-1.5 py-1 text-[12.5px] hover:border-border hover:bg-panel focus:border-accent focus:bg-panel focus:shadow-[0_0_0_2px_var(--accent-soft)] focus:outline-none';

export function RunGrid() {
  const ctx = useApp();
  const run = ctx.runs.find((r) => r.id === ctx.sel.runId);
  const [menu, setMenu] = useState<number | null>(null);
  if (!run) return null;
  const liveIds = new Set(ctx.cases.map((c) => c.id));

  const update = (i: number, patch: Partial<RunRow>) => ctx.updateRunRow(run.id, i, patch);
  const setResult = (i: number, result: Result) => {
    const row = run.rows[i];
    const patch: Partial<RunRow> = { result, executed_at: result === 'not_run' ? '' : nowStamp() };
    if (result !== 'not_run' && !row.tester && ctx.lastTester) patch.tester = ctx.lastTester;
    update(i, patch);
    setMenu(null);
  };

  const t: Tally = { pass: 0, fail: 0, blocked: 0, skipped: 0, not_run: 0 };
  run.rows.forEach((r) => (t[r.result] = (t[r.result] || 0) + 1));
  const executed = run.rows.length - t.not_run;
  const passRate = executed ? Math.round((t.pass / executed) * 100) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-[14px] border-b border-border bg-panel-2 px-[26px] py-[14px]">
        <Button icon variant="ghost" onClick={ctx.openRunsList} title="Back to runs">
          {I.back({ size: 16 })}
        </Button>
        <div>
          <div className="text-[16px] font-semibold">
            {run.name}{' '}
            <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em]', RUN_STATUS[run.status])}>
              {run.status}
            </span>
          </div>
          <div className="font-mono text-[11.5px] text-ink-faint">{run.file}</div>
        </div>
        <div className="ml-auto flex items-center gap-[14px]">
          <div
            className="flex h-[30px] w-[220px] overflow-hidden rounded-md border border-border"
            title={`${t.pass} pass · ${t.fail} fail · ${t.blocked} blocked · ${t.skipped} skipped · ${t.not_run} not run`}
          >
            {SEGS.map((s) =>
              t[s] ? (
                <i
                  key={s}
                  className="flex h-full items-center justify-center font-mono text-[11px] font-bold text-[oklch(1_0_0/0.92)] transition-[flex-grow] duration-300"
                  style={{ flexGrow: t[s], background: RES[s].color }}
                >
                  {t[s]}
                </i>
              ) : null,
            )}
          </div>
          <div className="text-right">
            <div
              className="text-[22px] font-bold leading-none tracking-[-0.01em]"
              style={{ color: passRate >= 80 ? 'var(--pass)' : passRate >= 50 ? 'var(--blocked)' : 'var(--fail)' }}
            >
              {passRate}%
            </div>
            <div className="text-[10.5px] uppercase tracking-[0.05em] text-ink-faint">pass rate</div>
          </div>
          <Button variant="ghost" onClick={() => ctx.rerunRun(run.id)} title="Create a fresh run from this one">
            {I.sync({ size: 13 })} Rerun
          </Button>
          <Button variant="primary" onClick={() => ctx.startGuide(run.id, firstUnrun(run))}>
            {I.play({ size: 13 })} Start testing
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <caption className="sr-only">Test cases in this run</caption>
          <thead>
            <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:z-[2] [&>th]:whitespace-nowrap [&>th]:border-b [&>th]:border-border-2 [&>th]:bg-panel-2 [&>th]:px-3 [&>th]:py-[9px] [&>th]:text-left [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-[0.05em] [&>th]:text-ink-faint">
              <th style={{ width: 90 }}>Case</th>
              <th>Title</th>
              <th style={{ width: 150 }}>Result</th>
              <th style={{ width: 110 }}>Tester</th>
              <th style={{ width: 130 }}>Executed</th>
              <th style={{ width: 230 }}>Notes</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {run.rows.map((row, i) => {
              const gone = !liveIds.has(row.case_id);
              return (
                <tr
                  key={row.case_id + i}
                  className="hover:bg-[oklch(0.975_0.004_80)] [&>td]:border-b [&>td]:border-border [&>td]:px-3 [&>td]:py-[7px] [&>td]:align-middle"
                >
                  <td className="whitespace-nowrap font-mono text-[12px] text-ink-3">{row.display_id}</td>
                  <td className="max-w-[420px]">
                    {gone ? (
                      <span className="text-ink-faint">{row.title}</span>
                    ) : (
                      <button
                        className="rounded-[3px] border-0 bg-transparent p-0 text-left text-ink hover:text-accent-ink hover:underline hover:underline-offset-2"
                        title="Walk through this case"
                        onClick={() => ctx.startGuide(run.id, i)}
                      >
                        {row.title}
                      </button>
                    )}
                    {gone && (
                      <span className="ml-1.5 text-[10px] text-fail" title="Case no longer resolves to a live file">
                        ⚠ deleted
                      </span>
                    )}
                  </td>
                  <td className="relative">
                    <button
                      className="inline-flex items-center gap-[5px] rounded-[5px] border border-border bg-panel px-[9px] py-[3px] font-mono text-[12px] font-semibold hover:bg-raise"
                      onClick={() => setMenu(menu === i ? null : i)}
                    >
                      <span className="size-[9px] rounded-[3px]" style={{ background: RES[row.result].color }} />
                      {RES[row.result].label}
                      {I.chevronDown({ size: 12 })}
                    </button>
                    {menu === i && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} />
                        <div className="absolute z-30 flex min-w-[130px] flex-col gap-0.5 rounded-md border border-border-2 bg-panel p-[5px] shadow-[0_12px_30px_var(--shadow)]">
                          {RESULTS.map((r) => (
                            <button
                              key={r.key}
                              className="flex items-center gap-2 rounded-sm border-0 bg-transparent px-[9px] py-1.5 text-left text-[12.5px] hover:bg-raise"
                              onClick={() => setResult(i, r.key)}
                            >
                              <span className="size-[9px] shrink-0 rounded-[3px]" style={{ background: r.color }} />
                              {r.label}
                              {row.result === r.key && <span className="ml-auto text-accent">{I.check({ size: 13 })}</span>}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </td>
                  <td>
                    <input
                      className={cn(cellInput, 'font-mono')}
                      value={row.tester}
                      placeholder={ctx.lastTester || '—'}
                      onChange={(e) => {
                        update(i, { tester: e.target.value });
                        if (e.target.value.trim()) ctx.setLastTester(e.target.value.trim());
                      }}
                    />
                  </td>
                  <td className="whitespace-nowrap font-mono text-[12px] text-ink-3">
                    {row.executed_at || <span className="text-ink-3">—</span>}
                  </td>
                  <td>
                    <NotesCell value={row.notes} onChange={(v) => update(i, { notes: v })} />
                  </td>
                  <td>
                    {!gone && (
                      <Button icon size="sm" variant="ghost" title="Walk through this case" onClick={() => ctx.startGuide(run.id, i)}>
                        {I.play({ size: 13 })}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mx-auto flex max-w-[880px] flex-col gap-4 px-[26px] py-[22px]">
          <section className="flex flex-col gap-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">Summary</div>
            <Textarea
              className="min-h-[64px] text-[13px] leading-[1.5]"
              value={run.summary}
              placeholder="A short summary of this run — scope, outcome, anything notable."
              onChange={(e) => ctx.setRunSummary(run.id, e.target.value)}
            />
          </section>

          <section className="flex flex-col gap-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">Approvals</div>
            <div className="grid grid-cols-2 gap-3">
              <ApprovalCard
                label="Tester"
                approval={run.testerApproval}
                defaultName={ctx.lastTester}
                onApprove={(name) => ctx.setRunApproval(run.id, 'tester', name)}
                onClear={() => ctx.setRunApproval(run.id, 'tester', '')}
              />
              <ApprovalCard
                label="Reviewer"
                approval={run.reviewerApproval}
                defaultName=""
                onApprove={(name) => ctx.setRunApproval(run.id, 'reviewer', name)}
                onClear={() => ctx.setRunApproval(run.id, 'reviewer', '')}
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">Notes</div>
            <Textarea
              className="min-h-[64px] text-[13px] leading-[1.5]"
              value={run.notes}
              placeholder="General notes about this run."
              onChange={(e) => ctx.setRunNotes(run.id, e.target.value)}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
