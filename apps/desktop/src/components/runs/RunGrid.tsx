import { useState } from 'react';
import { I } from '@/components/icons';
import { Button, RES, RESULTS } from '@/components/ui';
import { useApp } from '@/store/app-context';
import { firstUnrun, nowStamp } from '@/utils/ids';
import type { Result, RunRow } from '@/types';
import { NotesCell } from './NotesCell';

type Tally = Record<Result, number>;
const SEGS: Result[] = ['pass', 'fail', 'blocked', 'skipped', 'not_run'];

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
    <div className="run-view">
      <div className="run-bar">
        <Button icon variant="ghost" onClick={ctx.openRunsList} title="Back to runs">
          {I.back({ size: 16 })}
        </Button>
        <div>
          <div className="rb-title">
            {run.name} <span className={'run-status ' + run.status}>{run.status}</span>
          </div>
          <div className="rb-file">{run.file}</div>
        </div>
        <div className="summary">
          <div
            className="summary-bar"
            title={`${t.pass} pass · ${t.fail} fail · ${t.blocked} blocked · ${t.skipped} skipped · ${t.not_run} not run`}
          >
            {SEGS.map((s) => (t[s] ? <i key={s} style={{ flexGrow: t[s], background: RES[s].color }}>{t[s]}</i> : null))}
          </div>
          <div className="pass-rate">
            <div className="pct" style={{ color: passRate >= 80 ? 'var(--pass)' : passRate >= 50 ? 'var(--blocked)' : 'var(--fail)' }}>
              {passRate}%
            </div>
            <div className="lbl">pass rate</div>
          </div>
          <Button variant="primary" onClick={() => ctx.startGuide(run.id, firstUnrun(run))}>
            {I.play({ size: 13 })} Start testing
          </Button>
        </div>
      </div>

      <div className="grid-scroll">
        <table className="runs-grid">
          <thead>
            <tr>
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
                <tr key={row.case_id + i}>
                  <td className="c-did">{row.display_id}</td>
                  <td className="c-title">
                    {gone ? (
                      <span className="gone">{row.title}</span>
                    ) : (
                      <button className="c-title-link" title="Walk through this case" onClick={() => ctx.startGuide(run.id, i)}>
                        {row.title}
                      </button>
                    )}
                    {gone && (
                      <span className="gone-tag" title="Case no longer resolves to a live file">
                        ⚠ deleted
                      </span>
                    )}
                  </td>
                  <td style={{ position: 'relative' }}>
                    <button className="result-pick" onClick={() => setMenu(menu === i ? null : i)}>
                      <span className="dot" style={{ width: 9, height: 9, borderRadius: 3, background: RES[row.result].color }} />
                      {RES[row.result].label}
                      {I.chevronDown({ size: 12 })}
                    </button>
                    {menu === i && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 20 }} onClick={() => setMenu(null)} />
                        <div className="res-pop">
                          {RESULTS.map((r) => (
                            <button key={r.key} className="res-opt" onClick={() => setResult(i, r.key)}>
                              <span className="dot" style={{ background: r.color }} />
                              {r.label}
                              {row.result === r.key && (
                                <span style={{ marginLeft: 'auto', color: 'var(--accent)' }}>{I.check({ size: 13 })}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </td>
                  <td>
                    <input
                      className="cell-input mono"
                      value={row.tester}
                      placeholder={ctx.lastTester || '—'}
                      onChange={(e) => {
                        update(i, { tester: e.target.value });
                        if (e.target.value.trim()) ctx.setLastTester(e.target.value.trim());
                      }}
                    />
                  </td>
                  <td className="c-did">{row.executed_at || <span className="muted">—</span>}</td>
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
      </div>
    </div>
  );
}
