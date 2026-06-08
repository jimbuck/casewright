import { useEffect, useRef, useState } from 'react';
import { I } from '@/components/icons';
import { Button, RES, RESULTS } from '@/components/ui';
import { useApp } from '@/store/app-context';
import { nowStamp } from '@/utils/ids';
import { renderInline } from '@/utils/markdown';
import { numberSteps } from '@/utils/steps';
import type { Result } from '@/types';
import { GuideChecklist, type ChecklistItem } from './GuideChecklist';

export function RunGuide() {
  const ctx = useApp();
  const run = ctx.runs.find((r) => r.id === ctx.sel.runId);
  const idx = ctx.sel.guideIndex ?? 0;
  const [checks, setChecks] = useState<Record<string, Record<string, boolean>>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [tester, setTester] = useState(ctx.lastTester || 'amartin');
  const [notes, setNotes] = useState('');
  const [forceRecord, setForceRecord] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const runId = run?.id;
  // reset the recorder when the active case changes
  useEffect(() => {
    setResult(null);
    setNotes('');
    setForceRecord(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [idx, runId]);

  if (!run) return null;
  const row = run.rows[idx];
  const kase = ctx.cases.find((c) => c.id === row.case_id);

  const myChecks = checks[row.case_id] || {};
  const toggle = (key: string) =>
    setChecks((s) => ({
      ...s,
      [row.case_id]: { ...(s[row.case_id] || {}), [key]: !(s[row.case_id] || {})[key] },
    }));

  // ---- derive checklist items from the case ----
  const setupItems: ChecklistItem[] = kase
    ? kase.systems.map((sys, i) => ({ key: `setup:${i}`, text: `Confirm ${sys} is available and reachable.` }))
    : [];
  const stepNums = kase ? numberSteps(kase.steps) : [];
  const stepItems: ChecklistItem[] = kase
    ? kase.steps.map((s, i) => ({ key: `step:${i}`, text: s.text, num: stepNums[i], depth: s.depth }))
    : [];
  const acceptItems: ChecklistItem[] = kase ? kase.expected.map((t, i) => ({ key: `accept:${i}`, text: t })) : [];
  const allKeys = [...setupItems, ...stepItems, ...acceptItems].map((x) => x.key);
  const checkedCount = allKeys.filter((k) => myChecks[k]).length;
  const total = allKeys.length;
  const complete = total > 0 && checkedCount === total;
  const canRecord = complete || forceRecord;

  const setGroup = (items: ChecklistItem[], val: boolean) =>
    setChecks((s) => {
      const m = { ...(s[row.case_id] || {}) };
      items.forEach((it) => (m[it.key] = val));
      return { ...s, [row.case_id]: m };
    });

  // ---- navigation / recording ----
  const remaining = run.rows.map((_, i) => i).filter((i) => i !== idx && run.rows[i].result === 'not_run');
  const go = (i: number) => ctx.guideGo(i);
  const record = () => {
    if (!result) return;
    if (tester.trim()) ctx.setLastTester(tester.trim());
    ctx.updateRunRow(run.id, idx, { result, tester, notes, executed_at: nowStamp() });
    ctx.toast(`${row.display_id} recorded · ${RES[result].label}`);
    const next = run.rows.findIndex((r, i) => i > idx && r.result === 'not_run');
    const anyEarlier = run.rows.findIndex((r) => r.result === 'not_run');
    if (next !== -1) go(next);
    else if (anyEarlier !== -1) go(anyEarlier);
    else ctx.exitGuide();
  };

  const tested = run.rows.filter((r) => r.result !== 'not_run').length;

  return (
    <div className="run-view guide">
      <div className="guide-bar">
        <Button variant="ghost" onClick={ctx.exitGuide}>
          {I.back({ size: 15 })} Results grid
        </Button>
        <div className="gb-mid">
          <div className="gb-title">{run.name}</div>
          <div className="gb-sub">
            {tested} of {run.rows.length} cases recorded
          </div>
        </div>
        <div className="gb-nav">
          <Button icon disabled={idx === 0} onClick={() => go(idx - 1)} title="Previous case">
            {I.chevron({ size: 16, style: { transform: 'rotate(180deg)' } })}
          </Button>
          <span className="gb-count mono">
            {idx + 1} / {run.rows.length}
          </span>
          <Button icon disabled={idx === run.rows.length - 1} onClick={() => go(idx + 1)} title="Next case">
            {I.chevron({ size: 16 })}
          </Button>
        </div>
      </div>

      <div className="guide-scroll" ref={scrollRef}>
        <div className="guide-col">
          <div className="guide-caseh">
            <div className="gc-id mono">{row.display_id}</div>
            <h2>{kase ? kase.title : row.title}</h2>
            <div className="gc-prog">
              <div className="gc-prog-bar">
                <i style={{ width: (total ? (checkedCount / total) * 100 : 0) + '%' }} />
              </div>
              <span className="mono">
                {checkedCount}/{total} checks
              </span>
            </div>
          </div>

          {!kase ? (
            <div className="guide-missing">
              {I.warn({ size: 22 })}
              <div>
                <div style={{ fontWeight: 600, marginBottom: 3 }}>This case no longer resolves to a live file.</div>
                <div className="muted">
                  It was deleted after the run was created. You can still record a result from the snapshot.
                </div>
              </div>
            </div>
          ) : (
            <>
              <section className="guide-sec brief">
                <div className="gsec-h">
                  <span className="gsec-step">Brief</span>
                </div>
                <div className="gbrief-objective">{renderInline(kase.objective, 'gobj')}</div>
                <div className="gbrief-systems">
                  <div className="gbrief-label">Systems in scope</div>
                  <div className="gsys-list">
                    {kase.systems.map((s, i) => (
                      <span key={i} className="gsys">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </section>

              <GuideChecklist
                title="Setup"
                caption="Get the environment ready before you begin."
                items={setupItems}
                myChecks={myChecks}
                toggle={toggle}
                onAll={() => setGroup(setupItems, true)}
                onNone={() => setGroup(setupItems, false)}
              />
              <GuideChecklist
                title="Steps"
                caption="Perform each step in order and tick it off."
                numbered
                items={stepItems}
                myChecks={myChecks}
                toggle={toggle}
                onAll={() => setGroup(stepItems, true)}
                onNone={() => setGroup(stepItems, false)}
              />
              <GuideChecklist
                title="Acceptance Criteria"
                caption="Verify every expected result holds."
                items={acceptItems}
                myChecks={myChecks}
                toggle={toggle}
                onAll={() => setGroup(acceptItems, true)}
                onNone={() => setGroup(acceptItems, false)}
              />
            </>
          )}

          <section className={'guide-record' + (canRecord ? ' ready' : ' locked')}>
            <div className="grec-h">
              <span className="gsec-step">Record result</span>
              {!canRecord && (
                <span className="grec-gate">
                  {I.warn({ size: 13 })} Complete all {total} checks to record a pass
                </span>
              )}
              {complete && (
                <span className="grec-ok">
                  {I.check({ size: 14 })} All checks complete
                </span>
              )}
            </div>

            <div className="grec-body">
              <div className="grec-results">
                {RESULTS.filter((r) => r.key !== 'not_run').map((r) => (
                  <button
                    key={r.key}
                    className={'grec-pick' + (result === r.key ? ' on' : '')}
                    disabled={!canRecord}
                    style={
                      result === r.key
                        ? { borderColor: r.color, background: 'color-mix(in oklch, ' + r.color + ' 12%, white)' }
                        : undefined
                    }
                    onClick={() => setResult(r.key)}
                  >
                    <span className="dot" style={{ background: r.color }} />
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="grec-fields">
                <div className="field">
                  <label>Tester</label>
                  <input className="input mono" value={tester} disabled={!canRecord} onChange={(e) => setTester(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>
                    Notes {result === 'fail' && <span style={{ color: 'var(--fail)' }}>· link a defect</span>}
                  </label>
                  <textarea
                    className="textarea grec-notes"
                    value={notes}
                    disabled={!canRecord}
                    rows={1}
                    placeholder={result === 'fail' ? 'What failed? Markdown ok — link DEF-…' : 'Optional · markdown, multi-line'}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="grec-foot">
              {!complete && !forceRecord && (
                <Button variant="ghost" size="sm" className="grec-force" onClick={() => setForceRecord(true)}>
                  {I.warn({ size: 13 })} Can't complete — record fail / blocked / skipped
                </Button>
              )}
              <span style={{ flex: 1 }} />
              <Button variant="primary" disabled={!canRecord || !result} onClick={record}>
                {I.check({ size: 15 })} {remaining.length ? 'Save & next case' : 'Save & finish'}
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
