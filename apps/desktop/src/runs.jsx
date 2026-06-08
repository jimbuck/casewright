/* Casewright — runs: list, run grid, summary, create-run */

const RESULTS = [
  { key: "pass", label: "Pass", glyph: "✓", color: "var(--pass)" },
  { key: "fail", label: "Fail", glyph: "✕", color: "var(--fail)" },
  { key: "blocked", label: "Blocked", glyph: "▢", color: "oklch(0.5 0.13 66)" },
  { key: "skipped", label: "Skipped", glyph: "⤼", color: "var(--skipped)" },
  { key: "not_run", label: "Not run", glyph: "·", color: "var(--ink-3)" },
];
const RES = Object.fromEntries(RESULTS.map(r => [r.key, r]));

function ResultPill({ value }) {
  const r = RES[value] || RES.not_run;
  return <span className={"res res-" + value}><span className="dot" style={{ background: r.color }} />{r.label}</span>;
}

/* ---------- runs list ---------- */
function RunsList() {
  const ctx = React.useContext(window.CW_CTX);
  const { runs, openRun } = ctx;
  const tally = (rows) => {
    const t = { pass: 0, fail: 0, blocked: 0, skipped: 0, not_run: 0 };
    rows.forEach(r => t[r.result] = (t[r.result] || 0) + 1);
    return t;
  };
  return (
    <div className="run-view">
      <div className="runs-list-wrap">
        <div className="runs-head">
          <h2>Test runs</h2>
          <span className="tag">{ctx.workspace.runsDir}/</span>
          <button className="btn primary" style={{ marginLeft: "auto" }} onClick={ctx.openCreateRun}>{I.plus({ size: 15 })} New run</button>
        </div>
        <div className="run-cards">
          {runs.map(run => {
            const t = tally(run.rows); const total = run.rows.length;
            const segs = ["pass", "fail", "blocked", "skipped", "not_run"];
            return (
              <button key={run.id} className="run-card" onClick={() => openRun(run.id)}>
                <div className="rc-main">
                  <div className="rc-name">{run.name}<span className={"run-status " + run.status}>{run.status}</span></div>
                  <div className="rc-file">{run.file}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="rc-bar">
                    {segs.map(s => t[s] ? <i key={s} style={{ width: (t[s] / total * 100) + "%", background: RES[s].color }} /> : null)}
                  </div>
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 6, fontFamily: "var(--font-mono)" }}>
                    {total} cases · {t.pass} pass · {t.fail} fail{t.blocked ? " · " + t.blocked + " blocked" : ""}
                  </div>
                </div>
                <span className="ricon2" style={{ color: "var(--ink-faint)" }}>{I.chevron({ size: 16 })}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- run grid ---------- */
function RunGrid() {
  const ctx = React.useContext(window.CW_CTX);
  const run = ctx.runs.find(r => r.id === ctx.sel.runId);
  const [menu, setMenu] = React.useState(null);  // row index w/ open result menu
  if (!run) return null;
  const liveIds = new Set(ctx.cases.map(c => c.id));

  const update = (i, patch) => ctx.updateRunRow(run.id, i, patch);
  const setResult = (i, result) => {
    const row = run.rows[i];
    const patch = { result, executed_at: result === "not_run" ? "" : nowStamp() };
    if (result !== "not_run" && !row.tester && ctx.lastTester) patch.tester = ctx.lastTester;
    update(i, patch); setMenu(null);
  };

  const t = { pass: 0, fail: 0, blocked: 0, skipped: 0, not_run: 0 };
  run.rows.forEach(r => t[r.result] = (t[r.result] || 0) + 1);
  const executed = run.rows.length - t.not_run;
  const passRate = executed ? Math.round(t.pass / executed * 100) : 0;
  const segs = ["pass", "fail", "blocked", "skipped", "not_run"];

  return (
    <div className="run-view">
      <div className="run-bar">
        <button className="btn icon ghost" onClick={ctx.openRunsList} title="Back to runs">{I.back({ size: 16 })}</button>
        <div>
          <div className="rb-title">{run.name} <span className={"run-status " + run.status}>{run.status}</span></div>
          <div className="rb-file">{run.file}</div>
        </div>
        <div className="summary">
          <div className="summary-bar" title={`${t.pass} pass · ${t.fail} fail · ${t.blocked} blocked · ${t.skipped} skipped · ${t.not_run} not run`}>
            {segs.map(s => t[s] ? <i key={s} style={{ flexGrow: t[s], background: RES[s].color }}>{t[s]}</i> : null)}
          </div>
          <div className="pass-rate">
            <div className="pct" style={{ color: passRate >= 80 ? "var(--pass)" : passRate >= 50 ? "var(--blocked)" : "var(--fail)" }}>{passRate}%</div>
            <div className="lbl">pass rate</div>
          </div>
          <button className="btn primary" onClick={() => ctx.startGuide(run.id, firstUnrun(run))}>{I.play({ size: 13 })} Start testing</button>
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
                      <button className="c-title-link" title="Walk through this case" onClick={() => ctx.startGuide(run.id, i)}>{row.title}</button>
                    )}
                    {gone && <span className="gone-tag" title="Case no longer resolves to a live file">⚠ deleted</span>}
                  </td>
                  <td style={{ position: "relative" }}>
                    <button className="result-pick" onClick={() => setMenu(menu === i ? null : i)}>
                      <span className="dot" style={{ width: 9, height: 9, borderRadius: 3, background: RES[row.result].color }} />
                      {RES[row.result].label}{I.chevronDown({ size: 12 })}
                    </button>
                    {menu === i && (
                      <>
                        <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setMenu(null)} />
                        <div className="res-pop">
                          {RESULTS.map(r => (
                            <button key={r.key} className="res-opt" onClick={() => setResult(i, r.key)}>
                              <span className="dot" style={{ background: r.color }} />{r.label}
                              {row.result === r.key && <span style={{ marginLeft: "auto", color: "var(--accent)" }}>{I.check({ size: 13 })}</span>}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </td>
                  <td><input className="cell-input mono" value={row.tester} placeholder={ctx.lastTester || "—"} onChange={e => { update(i, { tester: e.target.value }); if (e.target.value.trim()) ctx.setLastTester(e.target.value.trim()); }} /></td>
                  <td className="c-did">{row.executed_at || <span className="muted">—</span>}</td>
                  <td><NotesCell value={row.notes} onChange={v => update(i, { notes: v })} /></td>
                  <td>{!gone && <button className="btn icon sm ghost" title="Walk through this case" onClick={() => ctx.startGuide(run.id, i)}>{I.play({ size: 13 })}</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* multi-line markdown notes cell — rendered when idle, textarea when editing */
function NotesCell({ value, onChange }) {
  const [editing, setEditing] = React.useState(false);
  const ref = React.useRef(null);
  const grow = (el) => { if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px"; };
  React.useEffect(() => { if (editing && ref.current) { ref.current.focus(); grow(ref.current); ref.current.setSelectionRange(value.length, value.length); } }, [editing]);
  if (editing) {
    return (
      <textarea ref={ref} className="cell-notes-edit" value={value} rows={1}
        placeholder="Notes — markdown, multi-line"
        onChange={e => { onChange(e.target.value); grow(e.target); }}
        onBlur={() => setEditing(false)}
        onKeyDown={e => { if (e.key === "Escape") setEditing(false); }} />
    );
  }
  const lines = (value || "").split("\n");
  return (
    <div className="cell-notes" onClick={() => setEditing(true)} title="Click to edit — markdown supported">
      {value
        ? lines.map((ln, i) => <div key={i} className="cn-line">{ln ? window.CWUtil.renderInline(ln, "n" + i) : <br />}</div>)
        : <span className="muted">—</span>}
    </div>
  );
}

function firstUnrun(run) {
  const i = run.rows.findIndex(r => r.result === "not_run");
  return i === -1 ? 0 : i;
}

function nowStamp() {
  const d = new Date(2026, 5, 1, 11, 0 + Math.floor(Math.random() * 59));
  const p = n => String(n).padStart(2, "0");
  return `2026-06-01 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- create run modal ---------- */
function CreateRunModal({ onClose }) {
  const ctx = React.useContext(window.CW_CTX);
  const [scope, setScope] = React.useState("tag");
  const [tag, setTag] = React.useState("Regression");
  const [suite, setSuite] = React.useState("billing");
  const [name, setName] = React.useState("Regression — Sprint 13");
  const allTags = [...new Set(ctx.cases.flatMap(c => c.tags))].sort();
  const suites = ctx.tree;

  const count = scope === "tag" ? ctx.cases.filter(c => c.tags.includes(tag)).length
    : scope === "suite" ? ctx.casesInSuite(suite).length : ctx.cases.length;

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><span className="ricon2" style={{ color: "var(--accent)" }}>{I.grid({ size: 18 })}</span><h3>New test run</h3></div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="field"><label>Run name</label><input className="input" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="field"><label>Scope — which cases to seed</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className={"scope-opt" + (scope === "tag" ? " on" : "")} onClick={() => setScope("tag")}>
                <span className="radio" /><div style={{ flex: 1 }}><div className="so-title">By tag</div>
                  <div className="so-sub">Every case carrying a tag.</div>
                  {scope === "tag" && <select className="select" style={{ marginTop: 8, width: "auto" }} value={tag} onClick={e => e.stopPropagation()} onChange={e => setTag(e.target.value)}>{allTags.map(t => <option key={t}>{t}</option>)}</select>}
                </div></div>
              <div className={"scope-opt" + (scope === "suite" ? " on" : "")} onClick={() => setScope("suite")}>
                <span className="radio" /><div style={{ flex: 1 }}><div className="so-title">By suite</div>
                  <div className="so-sub">All cases in a folder (and its sub-suites).</div>
                  {scope === "suite" && <select className="select" style={{ marginTop: 8, width: "auto" }} value={suite} onClick={e => e.stopPropagation()} onChange={e => setSuite(e.target.value)}>{suites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
                </div></div>
              <div className={"scope-opt" + (scope === "all" ? " on" : "")} onClick={() => setScope("all")}>
                <span className="radio" /><div><div className="so-title">Whole workspace</div><div className="so-sub">Every case in {ctx.workspace.name}.</div></div></div>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>{I.layers({ size: 13 })} Seeds <b>{count}</b> rows · keyed on stable <span className="mono">case_id</span> · result <span className="mono">not_run</span>.</div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => ctx.createRun({ name, scope, tag, suite })}>{I.plus({ size: 14 })} Create run</button>
        </div>
      </div>
    </div>
  );
}

window.RunsList = RunsList;
window.RunGrid = RunGrid;
window.CreateRunModal = CreateRunModal;
window.RES = RES; window.RESULTS = RESULTS;
window.nowStamp = nowStamp;
window.ResultPill = ResultPill;
