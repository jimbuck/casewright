/* Casewright — structured 3-way merge resolver (showpiece) */

const stepText = (steps) => steps.map(s => "  ".repeat(s.depth) + s.text).join("\n");
const listText = (items) => items.join("\n");

function serialize(el, which) {
  const v = el[which];
  if (el.kind === "steps") return stepText(v);
  if (el.kind === "list") return listText(v);
  return v;
}

/* word-level prose diff: render one side with its add/del highlights */
function ProseDiff({ ours, theirs, side, prose }) {
  const { del, add } = window.CWUtil.wordDiff(ours, theirs);
  const toks = side === "ours" ? del : add;
  const cls = side === "ours" ? "w-del" : "w-add";
  return (
    <div className={"diff-text" + (prose ? " prose" : "")}>
      {toks.map((t, i) => t.t === "same"
        ? <span key={i}>{t.v}</span>
        : <span key={i} className={cls}>{t.v}</span>)}
    </div>
  );
}

/* list diff: mark items unique to this side */
function ListDiff({ ours, theirs, side }) {
  const mine = side === "ours" ? ours : theirs;
  const other = side === "ours" ? theirs : ours;
  const oset = new Set(other);
  return (
    <ul className="diff-list">
      {mine.map((it, i) => {
        const changed = !oset.has(it);
        return (
          <li key={i} className={changed ? (side === "ours" ? "removed" : "added") : ""}>
            <span className="mk">–</span><span>{window.CWUtil.renderInline(it, "ld" + side + i)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function StepsDiff({ ours, theirs, side }) {
  const mine = side === "ours" ? ours : theirs;
  const other = side === "ours" ? theirs : ours;
  const oset = new Set(other.map(s => s.text));
  const nums = window.numberSteps ? window.numberSteps(mine) : mine.map((_, i) => i + 1);
  return (
    <div className="diff-steps">
      {mine.map((s, i) => {
        const changed = !oset.has(s.text);
        return (
          <div key={i} className={"stp " + (changed ? (side === "ours" ? "removed" : "added") : "")}
            style={{ paddingLeft: s.depth * 18, color: changed ? (side === "ours" ? "var(--del)" : "var(--add)") : undefined,
              textDecoration: changed && side === "ours" ? "line-through" : undefined }}>
            <span className="sn">{nums[i]}.</span><span>{s.text}</span>
          </div>
        );
      })}
    </div>
  );
}

function MergedPreview({ el, text }) {
  const prose = el.kind === "prose" || el.kind === "field";
  let body;
  if (el.kind === "steps") {
    const lines = text.split("\n");
    body = <div className="diff-steps">{lines.map((ln, i) => {
      const depth = (ln.match(/^ */)[0].length) / 2;
      return <div key={i} className="stp" style={{ paddingLeft: depth * 18 }}><span className="sn">{i + 1}.</span><span>{ln.trim()}</span></div>;
    })}</div>;
  } else if (el.kind === "list") {
    body = <ul className="diff-list">{text.split("\n").map((ln, i) => <li key={i}><span className="mk">–</span><span>{window.CWUtil.renderInline(ln, "mp" + i)}</span></li>)}</ul>;
  } else {
    body = <span>{window.CWUtil.renderInline(text, "mp")}</span>;
  }
  return (
    <div className={"merged-preview" + (prose ? " prose" : "")}>
      <div className="mp-h">{I.check({ size: 12 })} Merged result</div>
      <div className="mp-body">{body}</div>
    </div>
  );
}

/* one conflicting element */
function ConflictElement({ el, resKey, res, setRes }) {
  const choice = res && res.choice;
  const prose = el.kind === "prose" || el.kind === "field";
  const editing = choice === "edit";
  const text = res ? res.text : "";

  const pick = (which) => setRes(resKey, { choice: which, text: serialize(el, which === "edit" ? "ours" : which) });

  const SideBody = ({ side }) => {
    if (el.kind === "list") return <ListDiff ours={el.ours} theirs={el.theirs} side={side} />;
    if (el.kind === "steps") return <StepsDiff ours={el.ours} theirs={el.theirs} side={side} />;
    return <ProseDiff ours={el.ours} theirs={el.theirs} side={side} prose={prose} />;
  };

  return (
    <div className="elem is-conflict">
      <div className="elem-h">
        <span className="eh-name">{el.label}</span>
        <span className="eh-mark">{el.kind === "field" ? "front-matter" : "## " + el.label}</span>
        <span className="eh-status">
          {choice ? <span className="chip-resolved">{I.check({ size: 12 })} {choice === "ours" ? "kept yours" : choice === "theirs" ? "kept theirs" : "edited"}</span>
            : <span className="chip-conflict">{I.warn({ size: 12 })} conflict</span>}
        </span>
      </div>
      <div className="sides">
        <div className={"side ours" + (choice === "ours" ? " chosen" : "")}>
          <div className="side-h"><span className="lbl">Yours</span><span className="who">stage :2 · local</span>
            <span className="side-take"><button className="btn sm" onClick={() => pick("ours")}>{choice === "ours" ? I.check({ size: 12 }) : null} Take yours</button></span>
          </div>
          <SideBody side="ours" />
        </div>
        <div className={"side theirs" + (choice === "theirs" ? " chosen" : "")}>
          <div className="side-h"><span className="lbl">Theirs</span><span className="who">stage :3 · incoming</span>
            <span className="side-take"><button className="btn sm" onClick={() => pick("theirs")}>{choice === "theirs" ? I.check({ size: 12 }) : null} Take theirs</button></span>
          </div>
          <SideBody side="theirs" />
        </div>
      </div>
      <div className="base-ref">
        <div className="br-h">{I.clock({ size: 12 })} Base · merge-base (stage :1)</div>
        {el.kind === "steps" ? <div className="diff-steps">{el.base.map((s, i) => <div key={i} className="stp" style={{ paddingLeft: s.depth * 18 }}><span className="sn">{i + 1}.</span><span>{s.text}</span></div>)}</div>
          : el.kind === "list" ? <span>{el.base.join(" · ")}</span>
          : <span>{el.base}</span>}
      </div>
      <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, alignItems: "center" }}>
        <button className={"btn sm" + (editing ? " primary" : "")} onClick={() => pick("edit")}>{I.edit({ size: 13 })} Edit merged</button>
        {choice && !editing && <span className="muted" style={{ fontSize: 12 }}>Resolution applies to the whole {el.kind === "field" ? "field" : "section"}.</span>}
      </div>
      {editing && (
        <div style={{ padding: "0 14px 12px" }}>
          <textarea className="edit-area" value={text} onChange={e => setRes(resKey, { choice: "edit", text: e.target.value })} />
        </div>
      )}
      {choice && <MergedPreview el={el} text={text} />}
    </div>
  );
}

/* auto-merged element (collapsed, reassuring) */
function AutoElement({ el }) {
  let summary;
  if (el.kind === "tags") summary = <span>{(el.merged || el.theirs).map(t => <span key={t} className="tag" style={{ marginRight: 5 }}>#{t}</span>)}</span>;
  else if (el.auto === "same") summary = <span className="muted">unchanged on both sides</span>;
  else {
    const v = el.auto === "ours" ? el.ours : el.theirs;
    summary = el.kind === "list" ? <span>{(v || []).join(" · ")}</span>
      : el.kind === "steps" ? <span className="mono">{(v || []).map(s => s.text).join(" → ")}</span>
      : <span>{v}</span>;
  }
  return (
    <div className="elem is-auto">
      <div className="elem-h">
        <span className="eh-name">{el.label}</span>
        <span className="eh-mark">{el.kind === "field" ? "front-matter" : "## " + el.label}</span>
        <span className="eh-status"><span className="chip-auto">{I.check({ size: 12 })} auto-merged</span></span>
      </div>
      <div className="elem-auto-body">{summary}
        {el.reason && <div className="reason">{el.reason}</div>}
      </div>
    </div>
  );
}

/* CSV row conflict */
function CsvRowConflict({ row, resKey, res, setRes }) {
  const choice = res && res.choice;
  const Side = ({ side, data, label, who }) => (
    <div className={"side " + side + (choice === side ? " chosen" : "")}>
      <div className="side-h"><span className="lbl">{label}</span><span className="who">{who}</span>
        <span className="side-take"><button className="btn sm" onClick={() => setRes(resKey, { choice: side })}>{choice === side ? I.check({ size: 12 }) : null} Take {side === "ours" ? "yours" : "theirs"}</button></span>
      </div>
      <div className="csv-row-grid">
        <span className="k">result</span><ResultPill value={data.result} />
        <span className="k">tester</span><span className="mono">{data.tester || "—"}</span>
        <span className="k">notes</span><span>{data.notes || <span className="muted">—</span>}</span>
      </div>
    </div>
  );
  return (
    <div className="elem is-conflict">
      <div className="elem-h">
        <span className="eh-name"><span className="mono">{row.display_id}</span> — result row</span>
        <span className="eh-mark">case_id {row.case_id}</span>
        <span className="eh-status">{choice ? <span className="chip-resolved">{I.check({ size: 12 })} {choice === "ours" ? "kept yours" : "kept theirs"}</span> : <span className="chip-conflict">{I.warn({ size: 12 })} conflict</span>}</span>
      </div>
      <div className="sides">
        <Side side="ours" data={row.ours} label="Yours" who="stage :2 · local" />
        <Side side="theirs" data={row.theirs} label="Theirs" who="stage :3 · incoming" />
      </div>
      <div className="base-ref"><div className="br-h">{I.clock({ size: 12 })} Base</div><ResultPill value={row.base.result} /></div>
    </div>
  );
}

/* file detail panel */
function FileDetail({ file, resolutions, setRes }) {
  if (file.kind === "run") {
    const autoRows = file.rows.filter(r => !r.conflict);
    const conflictRows = file.rows.filter(r => r.conflict);
    return (
      <div className="merge-detail">
        <div className="md-file-h"><h4>{file.title}</h4></div>
        <div className="fp" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)", marginBottom: 14 }}>{file.path}</div>
        <div className="md-auto-note">{I.check({ size: 14 })} {autoRows.length} row(s) auto-merged by <span className="mono">case_id</span> — only diverging rows need a choice.</div>
        {file.rows.map((r, i) => r.conflict
          ? <CsvRowConflict key={i} row={r} resKey={file.path + "::" + r.case_id} res={resolutions[file.path + "::" + r.case_id]} setRes={setRes} />
          : <div key={i} className="elem is-auto"><div className="elem-h"><span className="eh-name"><span className="mono">{r.display_id}</span></span><span className="eh-status"><span className="chip-auto">{I.check({ size: 12 })} {r.auto === "same" ? "unchanged" : "auto-merged"}</span></span></div>{r.reason && <div className="elem-auto-body"><div className="reason">{r.reason}</div></div>}</div>
        )}
      </div>
    );
  }
  const conflicts = file.elements.filter(e => e.conflict);
  const autos = file.elements.filter(e => !e.conflict);
  return (
    <div className="merge-detail">
      <div className="md-file-h"><span className="fp">{file.displayId}</span><h4>{file.title}</h4></div>
      <div className="fp" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)", marginBottom: 14 }}>{file.path}</div>
      <div className="md-auto-note">{I.check({ size: 14 })} {autos.length} element(s) auto-merged — {conflicts.length} need your decision.</div>
      {file.elements.map((el, i) => el.conflict
        ? <ConflictElement key={i} el={el} resKey={file.path + "::" + el.key} res={resolutions[file.path + "::" + el.key]} setRes={setRes} />
        : <AutoElement key={i} el={el} />)}
    </div>
  );
}

/* root resolver */
function MergeResolver({ onComplete, onCancel }) {
  const conflict = window.CW.conflict;
  const [active, setActive] = React.useState(0);
  const [resolutions, setResolutions] = React.useState({});
  const setRes = (k, v) => setResolutions(s => ({ ...s, [k]: v }));

  // count conflicts per file + resolved
  const fileStats = conflict.files.map(f => {
    const conflicts = f.kind === "run" ? f.rows.filter(r => r.conflict) : f.elements.filter(e => e.conflict);
    const keys = conflicts.map(c => f.path + "::" + (f.kind === "run" ? c.case_id : c.key));
    const resolved = keys.filter(k => resolutions[k]).length;
    return { total: keys.length, resolved };
  });
  const totalConflicts = fileStats.reduce((a, s) => a + s.total, 0);
  const totalResolved = fileStats.reduce((a, s) => a + s.resolved, 0);
  const done = totalResolved === totalConflicts;

  return (
    <div className="scrim">
      <div className="modal merge-modal" onClick={e => e.stopPropagation()}>
        <div className="merge-head">
          <div className="mh-icon">{I.merge({ size: 20 })}</div>
          <div>
            <h3>Resolve merge — pull from <span className="mono">origin/{conflict.branch}</span></h3>
            <div className="mh-sub">Structured 3-way merge · non-conflicting changes already merged automatically</div>
          </div>
          <div className="merge-progress">
            <span>{totalResolved} / {totalConflicts} conflicts</span>
            <div className="mp-bar"><i style={{ width: (totalConflicts ? totalResolved / totalConflicts * 100 : 100) + "%" }} /></div>
          </div>
        </div>

        <div className="merge-body">
          <div className="merge-files">
            <div className="mf-group-h">Conflicted files · {conflict.files.length}</div>
            {conflict.files.map((f, i) => {
              const st = fileStats[i]; const resolved = st.resolved === st.total;
              return (
                <div key={i} className={"mf-file" + (active === i ? " sel" : "")} onClick={() => setActive(i)}>
                  <div className="mf-name">
                    <span className={"mf-state " + (resolved ? "resolved" : "pending")} />
                    <span className="ricon2" style={{ color: "var(--ink-faint)" }}>{f.kind === "run" ? I.grid({ size: 13 }) : I.file({ size: 13 })}</span>
                    <span className="ft">{f.path.split("/").pop()}</span>
                    <span className={"mf-badge " + (resolved ? "resolved" : "pending")}>{resolved ? "done" : st.resolved + "/" + st.total}</span>
                  </div>
                  <div className="mf-path">{f.path.replace(/\/[^/]+$/, "")}</div>
                </div>
              );
            })}
          </div>
          <FileDetail file={conflict.files[active]} resolutions={resolutions} setRes={setRes} />
        </div>

        <div className="merge-foot">
          <span className="mf-status">
            {done ? <><span style={{ color: "var(--pass)", display: "inline-flex", gap: 6, alignItems: "center" }}>{I.check({ size: 14 })} All conflicts resolved</span></>
              : <>{I.warn({ size: 14 })} {totalConflicts - totalResolved} conflict(s) remaining</>}
          </span>
          <span className="spacer" />
          <button className="btn ghost" onClick={onCancel}>Abort merge</button>
          <button className="btn" onClick={onCancel} title="Hand-edit raw markdown / CSV">{I.code({ size: 14 })} Raw view</button>
          <button className="btn primary" disabled={!done} onClick={() => onComplete(resolutions)}>{I.merge({ size: 14 })} Complete merge</button>
        </div>
      </div>
    </div>
  );
}

window.MergeResolver = MergeResolver;
