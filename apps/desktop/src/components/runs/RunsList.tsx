import { I } from '@/components/icons';
import { Button, RES, Tag } from '@/components/ui';
import { useApp } from '@/store/app-context';
import type { Result, RunRow } from '@/types';

type Tally = Record<Result, number>;
const emptyTally = (): Tally => ({ pass: 0, fail: 0, blocked: 0, skipped: 0, not_run: 0 });
const SEGS: Result[] = ['pass', 'fail', 'blocked', 'skipped', 'not_run'];

export function RunsList() {
  const ctx = useApp();
  const { runs, openRun } = ctx;
  const tally = (rows: RunRow[]): Tally => {
    const t = emptyTally();
    rows.forEach((r) => (t[r.result] = (t[r.result] || 0) + 1));
    return t;
  };
  return (
    <div className="run-view">
      <div className="runs-list-wrap">
        <div className="runs-head">
          <h2>Test runs</h2>
          <Tag>{ctx.workspace.runsDir}/</Tag>
          <Button variant="primary" style={{ marginLeft: 'auto' }} onClick={ctx.openCreateRun}>
            {I.plus({ size: 15 })} New run
          </Button>
        </div>
        <div className="run-cards">
          {runs.map((run) => {
            const t = tally(run.rows);
            const total = run.rows.length;
            return (
              <button key={run.id} className="run-card" onClick={() => openRun(run.id)}>
                <div className="rc-main">
                  <div className="rc-name">
                    {run.name}
                    <span className={'run-status ' + run.status}>{run.status}</span>
                  </div>
                  <div className="rc-file">{run.file}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="rc-bar">
                    {SEGS.map((s) =>
                      t[s] ? <i key={s} style={{ width: (t[s] / total) * 100 + '%', background: RES[s].color }} /> : null,
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                    {total} cases · {t.pass} pass · {t.fail} fail{t.blocked ? ' · ' + t.blocked + ' blocked' : ''}
                  </div>
                </div>
                <span className="ricon2" style={{ color: 'var(--ink-faint)' }}>
                  {I.chevron({ size: 16 })}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
