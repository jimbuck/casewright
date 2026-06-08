/* Casewright — guided test runner: walk a tester through one case, gate the
   result on completing every checklist item (setup → steps → acceptance). */

function GuideCheck({ checked, onToggle, children, num, depth }) {
  return (
    <button className={"gcheck" + (checked ? " on" : "")} onClick={onToggle}
      style={depth ? { marginLeft: depth * 26 } : null}>
      {checked
        ? <span key="on" className="gcheck-box gcheck-box--on">{I.check({ size: 13 })}</span>
        : <span key="off" className="gcheck-box gcheck-box--off" />}
      {num != null && <span className="gcheck-num">{num}</span>}
      <span className="gcheck-text">{children}</span>
    </button>
  );
}

function RunGuide() {
  const ctx = React.useContext(window.CW_CTX);
  const run = ctx.runs.find(r => r.id === ctx.sel.runId);
  const idx = ctx.sel.guideIndex ?? 0;
  const [checks, setChecks] = React.useState({});       // { case_id: { 'setup:0': true } }
  const [result, setResult] = React.useState(null);
  const [tester, setTester] = React.useState(ctx.lastTester || "amartin");
  const [notes, setNotes] = React.useState("");
  const [forceRecord, setForceRecord] = React.useState(false);
  const scrollRef = React.useRef(null);

  if (!run) return null;
  const row = run.rows[idx];
  const kase = ctx.cases.find(c => c.id === row.case_id);

  // reset the recorder when the active case changes
  React.useEffect(() => {
    setResult(null); setNotes(""); setForceRecord(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [idx, run.id]);

  const myChecks = checks[row.case_id] || {};
  const toggle = (key) => setChecks(s => ({ ...s, [row.case_id]: { ...(s[row.case_id] || {}), [key]: !((s[row.case_id] || {})[key]) } }));

  // ---- derive checklist items from the case ----
  const setupItems = kase ? kase.systems.map((sys, i) => ({ key: `setup:${i}`, text: `Confirm ${sys} is available and reachable.` })) : [];
  const stepNums = kase ? window.numberSteps(kase.steps) : [];
  const stepItems = kase ? kase.steps.map((s, i) => ({ key: `step:${i}`, text: s.text, num: stepNums[i], depth: s.depth })) : [];
  const acceptItems = kase ? kase.expected.map((t, i) => ({ key: `accept:${i}`, text: t })) : [];
  const allKeys = [...setupItems, ...stepItems, ...acceptItems].map(x => x.key);
  const checkedCount = allKeys.filter(k => myChecks[k]).length;
  const total = allKeys.length;
  const complete = total > 0 && checkedCount === total;
  const canRecord = complete || forceRecord;

  const setGroup = (items, val) => setChecks(s => {
    const m = { ...(s[row.case_id] || {}) }; items.forEach(it => m[it.key] = val); return { ...s, [row.case_id]: m };
  });

  // ---- navigation / recording ----
  const remaining = run.rows.map((r, i) => i).filter(i => i !== idx && run.rows[i].result === "not_run");
  const go = (i) => ctx.guideGo(i);
  const record = () => {
    if (!result) return;
    if (tester.trim()) ctx.setLastTester(tester.trim());
    ctx.updateRunRow(run.id, idx, { result, tester, notes, executed_at: window.nowStamp() });
    ctx.toast(`${row.display_id} recorded · ${window.RES[result].label}`);
    const next = run.rows.findIndex((r, i) => i > idx && r.result === "not_run");
    const anyEarlier = run.rows.findIndex((r) => r.result === "not_run");
    if (next !== -1) go(next);
    else if (anyEarlier !== -1) go(anyEarlier);
    else ctx.exitGuide();
  };

  const tested = run.rows.filter(r => r.result !== "not_run").length;

  return (
    <div className="run-view guide">
      <div className="guide-bar">
        <button className="btn ghost" onClick={ctx.exitGuide}>{I.back({ size: 15 })} Results grid</button>
        <div className="gb-mid">
          <div className="gb-title">{run.name}</div>
          <div className="gb-sub">{tested} of {run.rows.length} cases recorded</div>
        </div>
        <div className="gb-nav">
          <button className="btn icon" disabled={idx === 0} onClick={() => go(idx - 1)} title="Previous case">{I.chevron({ size: 16, style: { transform: "rotate(180deg)" } })}</button>
          <span className="gb-count mono">{idx + 1} / {run.rows.length}</span>
          <button className="btn icon" disabled={idx === run.rows.length - 1} onClick={() => go(idx + 1)} title="Next case">{I.chevron({ size: 16 })}</button>
        </div>
      </div>

      <div className="guide-scroll" ref={scrollRef}>
        <div className="guide-col">
          {/* heading */}
          <div className="guide-caseh">
            <div className="gc-id mono">{row.display_id}</div>
            <h2>{kase ? kase.title : row.title}</h2>
            <div className="gc-prog">
              <div className="gc-prog-bar"><i style={{ width: (total ? checkedCount / total * 100 : 0) + "%" }} /></div>
              <span className="mono">{checkedCount}/{total} checks</span>
            </div>
          </div>

          {!kase ? (
            <div className="guide-missing">
              {I.warn({ size: 22 })}
              <div>
                <div style={{ fontWeight: 600, marginBottom: 3 }}>This case no longer resolves to a live file.</div>
                <div className="muted">It was deleted after the run was created. You can still record a result from the snapshot.</div>
              </div>
            </div>
          ) : (
            <>
              {/* 1 — brief */}
              <section className="guide-sec brief">
                <div className="gsec-h"><span className="gsec-step">Brief</span></div>
                <div className="gbrief-objective">{window.CWUtil.renderInline(kase.objective, "gobj")}</div>
                <div className="gbrief-systems">
                  <div className="gbrief-label">Systems in scope</div>
                  <div className="gsys-list">
                    {kase.systems.map((s, i) => <span key={i} className="gsys">{s}</span>)}
                  </div>
                </div>
              </section>

              {/* 2 — setup */}
              <GuideChecklist title="Setup" caption="Get the environment ready before you begin."
                items={setupItems} myChecks={myChecks} toggle={toggle}
                onAll={() => setGroup(setupItems, true)} onNone={() => setGroup(setupItems, false)} />

              {/* 3 — steps */}
              <GuideChecklist title="Steps" caption="Perform each step in order and tick it off." numbered
                items={stepItems} myChecks={myChecks} toggle={toggle}
                onAll={() => setGroup(stepItems, true)} onNone={() => setGroup(stepItems, false)} />

              {/* 4 — acceptance */}
              <GuideChecklist title="Acceptance Criteria" caption="Verify every expected result holds."
                items={acceptItems} myChecks={myChecks} toggle={toggle}
                onAll={() => setGroup(acceptItems, true)} onNone={() => setGroup(acceptItems, false)} />
            </>
          )}

          {/* 5 — record */}
          <section className={"guide-record" + (canRecord ? " ready" : " locked")}>
            <div className="grec-h">
              <span className="gsec-step">Record result</span>
              {!canRecord && <span className="grec-gate">{I.warn({ size: 13 })} Complete all {total} checks to record a pass</span>}
              {complete && <span className="grec-ok">{I.check({ size: 14 })} All checks complete</span>}
            </div>

            <div className="grec-body">
              <div className="grec-results">
                {window.RESULTS.filter(r => r.key !== "not_run").map(r => (
                  <button key={r.key}
                    className={"grec-pick" + (result === r.key ? " on" : "")}
                    disabled={!canRecord}
                    style={result === r.key ? { borderColor: r.color, background: "color-mix(in oklch, " + r.color + " 12%, white)" } : null}
                    onClick={() => setResult(r.key)}>
                    <span className="dot" style={{ background: r.color }} />{r.label}
                  </button>
                ))}
              </div>
              <div className="grec-fields">
                <div className="field"><label>Tester</label>
                  <input className="input mono" value={tester} disabled={!canRecord} onChange={e => setTester(e.target.value)} /></div>
                <div className="field" style={{ flex: 1 }}><label>Notes {result === "fail" && <span style={{ color: "var(--fail)" }}>· link a defect</span>}</label>
                  <textarea className="textarea grec-notes" value={notes} disabled={!canRecord} rows={1}
                    placeholder={result === "fail" ? "What failed? Markdown ok — link DEF-…" : "Optional · markdown, multi-line"}
                    onChange={e => { setNotes(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }} /></div>
              </div>
            </div>

            <div className="grec-foot">
              {!complete && !forceRecord && (
                <button className="btn ghost sm grec-force" onClick={() => setForceRecord(true)}>
                  {I.warn({ size: 13 })} Can't complete — record fail / blocked / skipped
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button className="btn primary" disabled={!canRecord || !result} onClick={record}>
                {I.check({ size: 15 })} {remaining.length ? "Save & next case" : "Save & finish"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function GuideChecklist({ title, caption, items, myChecks, toggle, numbered, onAll, onNone }) {
  const done = items.filter(it => myChecks[it.key]).length;
  const allDone = items.length > 0 && done === items.length;
  return (
    <section className="guide-sec">
      <div className="gsec-h">
        <span className="gsec-step">{title}</span>
        <span className="gsec-cap">{caption}</span>
        <span className="gsec-prog mono">{allDone ? <span className="gsec-done">{I.check({ size: 12 })} done</span> : `${done}/${items.length}`}</span>
        <button className="btn ghost sm" onClick={allDone ? onNone : onAll}>{allDone ? "Clear" : "Check all"}</button>
      </div>
      <div className="gcheck-list">
        {items.length === 0 && <div className="muted" style={{ fontSize: 13, padding: "6px 2px" }}>None specified.</div>}
        {items.map(it => (
          <GuideCheck key={it.key} checked={!!myChecks[it.key]} onToggle={() => toggle(it.key)}
            num={numbered ? it.num + "." : null} depth={it.depth}>
            {window.CWUtil.renderInline(it.text, it.key)}
          </GuideCheck>
        ))}
      </div>
    </section>
  );
}

window.RunGuide = RunGuide;
