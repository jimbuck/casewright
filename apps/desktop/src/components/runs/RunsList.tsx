import { I } from '@/components/icons';
import { Button, RES, RowContextMenu, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app-store';
import type { Result, RunRow } from '@/types';

type Tally = Record<Result, number>;
const emptyTally = (): Tally => ({ pass: 0, fail: 0, blocked: 0, skipped: 0, not_run: 0 });
const SEGS: Result[] = ['pass', 'fail', 'blocked', 'skipped', 'not_run'];

const RUN_STATUS: Record<string, string> = {
  open: 'text-accent-ink bg-accent-soft',
  closed: 'text-ink-3 bg-sunken',
};

export function RunsList() {
  const ctx = useApp();
  const { runs, openRun } = ctx;
  const tally = (rows: RunRow[]): Tally => {
    const t = emptyTally();
    rows.forEach((r) => (t[r.result] = (t[r.result] || 0) + 1));
    return t;
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-auto px-[30px] py-[26px]">
        <div className="mb-[18px] flex items-center gap-3">
          <h2 className="m-0 text-[18px] font-semibold">Test runs</h2>
          <Tag>.casewright/runs/</Tag>
          <Button variant="primary" className="ml-auto" onClick={ctx.openCreateRun}>
            {I.plus({ size: 15 })} New run
          </Button>
        </div>
        <div className="flex flex-col gap-2.5">
          {runs.map((run) => {
            const t = tally(run.rows);
            const total = run.rows.length;
            return (
              <RowContextMenu
                key={run.id}
                items={[
                  { label: 'Duplicate', icon: I.copy, on: () => ctx.duplicateRun(run.id) },
                  { label: 'Export PDF…', icon: I.download, on: () => ctx.exportRunToPdf(run.id) },
                  { sep: true },
                  { label: 'Delete', icon: I.trash, danger: true, on: () => ctx.deleteRun(run.id) },
                ]}
              >
              <button
                className="flex items-center gap-4 rounded-lg border border-border bg-panel px-[18px] py-[15px] text-left transition hover:border-accent-line hover:shadow-[0_2px_8px_var(--shadow)]"
                onClick={() => openRun(run.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-[9px] text-[14.5px] font-semibold">
                    {run.name}
                    <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em]', RUN_STATUS[run.status])}>
                      {run.status}
                    </span>
                  </div>
                  <div className="mt-[3px] font-mono text-[11.5px] text-ink-faint">{run.file}</div>
                </div>
                <div className="w-[260px] shrink-0 text-right">
                  <div className="flex h-[7px] w-full overflow-hidden rounded-full bg-sunken">
                    {SEGS.map((s) =>
                      t[s] ? <i key={s} className="block h-full" style={{ width: (t[s] / total) * 100 + '%', background: RES[s].color }} /> : null,
                    )}
                  </div>
                  <div className="mt-1.5 whitespace-nowrap font-mono text-[11.5px] text-ink-3">
                    {total} cases · {t.pass} pass · {t.fail} fail{t.blocked ? ' · ' + t.blocked + ' blocked' : ''}
                  </div>
                </div>
                <span className="grid place-items-center text-ink-faint">{I.chevron({ size: 16 })}</span>
              </button>
              </RowContextMenu>
            );
          })}
        </div>
      </div>
    </div>
  );
}
