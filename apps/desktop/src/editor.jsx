/* Casewright — case editor: front-matter form + 4 structured-section controls */

/* ---------- inline-formatting toolbar (shared by Objective + list items) ---------- */
function FmtBar({ targetRef, onApply, hint = true }) {
  const apply = (before, after) => {
    const el = targetRef.current; if (!el) return;
    const r = window.CWUtil.wrapSelection(el, before, after);
    onApply(r.value);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.selStart, r.selEnd); });
  };
  return (
    <div className="fmt-bar">
      <button className="fmt-btn" title="Bold" onMouseDown={e => e.preventDefault()} onClick={() => apply("**", "**")}>{I.bold({ size: 15 })}</button>
      <button className="fmt-btn" title="Italic" onMouseDown={e => e.preventDefault()} onClick={() => apply("*", "*")}>{I.italic({ size: 15 })}</button>
      <button className="fmt-btn" title="Strikethrough" onMouseDown={e => e.preventDefault()} onClick={() => apply("~~", "~~")}>{I.strike({ size: 15 })}</button>
      <span className="fmt-sep" />
      <button className="fmt-btn" title="Inline code" onMouseDown={e => e.preventDefault()} onClick={() => apply("`", "`")}>{I.code({ size: 15 })}</button>
      <button className="fmt-btn" title="Link" onMouseDown={e => e.preventDefault()} onClick={() => apply("[", "](https://)")}>{I.link({ size: 15 })}</button>
      {hint && <span className="fmt-hint">inline only — bold, italic, strike, code, links</span>}
    </div>
  );
}

/* ---------- Objective: editorial reading surface ---------- */
function ObjectiveEditor({ value, onChange }) {
  const ref = React.useRef(null);
  const [preview, setPreview] = React.useState(false);
  const blocked = window.CWUtil.hasBlockConstructs(value);
  return (
    <div className="section">
      <div className="section-h">
        <span className="ricon2" style={{ color: "var(--ink-3)" }}>{I.edit({ size: 15 })}</span>
        <span className="sh-title">Objective</span>
        <span className="sh-mark">## Objective</span>
        <span className="sh-spacer" />
        <button className="btn ghost sm" onClick={() => setPreview(p => !p)}>
          {preview ? I.edit({ size: 13 }) : I.eye({ size: 13 })} {preview ? "Edit" : "Preview"}
        </button>
      </div>
      <div className="objective-wrap">
        {!preview && <FmtBar targetRef={ref} onApply={onChange} />}
        {preview ? (
          <div className="objective-preview">{window.CWUtil.renderInline(value, "obj") || <span className="muted">No objective yet.</span>}</div>
        ) : (
          <textarea ref={ref} className="objective" value={value}
            placeholder="Describe what this case verifies, and why it matters…"
            onChange={e => onChange(e.target.value)} />
        )}
        {blocked && (
          <div className="block-warn">
            {I.warn({ size: 14 })}
            <span>Block-level markdown isn't allowed in fields — only inline formatting.</span>
            <button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => onChange(window.CWUtil.sanitizeInline(value))}>Clean up</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- generic single-line list control (Systems / Expected) ---------- */
function ListControl({ icon, title, mark, marker, items, onChange, placeholder }) {
  const refs = React.useRef({});
  const [drag, setDrag] = React.useState(null);
  const [dropIdx, setDropIdx] = React.useState(null);   // gap 0..len where item lands

  const setItem = (i, v) => onChange(items.map((x, j) => j === i ? v : x));
  const remove = (i) => onChange(items.filter((_, j) => j !== i));
  const add = () => { onChange([...items, ""]); requestAnimationFrame(() => { const el = refs.current[items.length]; el && el.focus(); }); };
  const rowOver = (i) => (e) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const before = (e.clientY - r.top) < r.height / 2;
    setDropIdx(before ? i : i + 1);
  };
  const doDrop = (e) => {
    if (e) e.preventDefault();
    if (drag !== null && dropIdx !== null) {
      let at = dropIdx; if (drag < dropIdx) at -= 1;
      const next = items.slice(); const [x] = next.splice(drag, 1); next.splice(at, 0, x); onChange(next);
    }
    setDrag(null); setDropIdx(null);
  };
  const endDrag = () => { setDrag(null); setDropIdx(null); };

  return (
    <div className="section">
      <div className="section-h">
        <span className="ricon2" style={{ color: "var(--ink-3)" }}>{icon}</span>
        <span className="sh-title">{title}</span>
        <span className="sh-mark">{mark}</span>
      </div>
      <div className="item-list compact" onDragOver={e => e.preventDefault()} onDrop={doDrop}>
        {items.map((it, i) => (
          <React.Fragment key={i}>
            {drag !== null && dropIdx === i && <div className="drop-line" />}
            <div
              className={"litem" + (drag === i ? " dragging" : "")}
              onDragOver={rowOver(i)} onDrop={doDrop}>
              <span className="grip" draggable onDragStart={() => setDrag(i)} onDragEnd={endDrag}>{I.drag({ size: 14 })}</span>
              <span className="bullet">{marker}</span>
              <input ref={el => refs.current[i] = el} className="li-input" value={it}
                placeholder={placeholder}
                onChange={e => setItem(i, e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onChange([...items.slice(0, i + 1), "", ...items.slice(i + 1)]); requestAnimationFrame(() => refs.current[i + 1] && refs.current[i + 1].focus()); }
                  if (e.key === "Backspace" && it === "" && items.length > 1) { e.preventDefault(); remove(i); requestAnimationFrame(() => refs.current[Math.max(0, i - 1)] && refs.current[Math.max(0, i - 1)].focus()); } }} />
              <button className="btn icon sm ghost li-del" title="Remove" onClick={() => remove(i)}>{I.trash({ size: 13 })}</button>
            </div>
          </React.Fragment>
        ))}
        {drag !== null && dropIdx === items.length && <div className="drop-line" />}
      </div>
      <button className="add-item" onClick={add}>{I.plus({ size: 14 })} Add item</button>
    </div>
  );
}

/* ---------- Steps: ordered, nestable ---------- */
function numberSteps(steps) {
  const counters = []; const out = [];
  steps.forEach(s => {
    const d = s.depth;
    counters[d] = (counters[d] || 0) + 1;
    counters.length = d + 1;
    out.push(counters.slice(0, d + 1).join("."));
  });
  return out;
}
function StepsControl({ steps, onChange }) {
  const refs = React.useRef({});
  const listRef = React.useRef(null);
  const [drag, setDrag] = React.useState(null);
  const [dropIdx, setDropIdx] = React.useState(null);   // gap 0..len
  const [dropDepth, setDropDepth] = React.useState(0);  // target nesting at the gap
  const nums = numberSteps(steps);

  const setText = (i, v) => onChange(steps.map((s, j) => j === i ? { ...s, text: v } : s));
  const setDepth = (i, d) => onChange(steps.map((s, j) => j === i ? { ...s, depth: Math.max(0, Math.min(3, d)) } : s));
  const remove = (i) => onChange(steps.filter((_, j) => j !== i));
  const addAfter = (i) => { const d = i >= 0 ? steps[i].depth : 0; const next = steps.slice(); next.splice(i + 1, 0, { text: "", depth: d }); onChange(next); requestAnimationFrame(() => refs.current[i + 1] && refs.current[i + 1].focus()); };

  // the deepest nesting allowed at a gap = (depth of the item just above it) + 1
  const maxDepthAt = (gap) => {
    const arr = drag !== null ? steps.filter((_, j) => j !== drag) : steps;
    const gapND = drag !== null && drag < gap ? gap - 1 : gap;
    const prev = arr[gapND - 1];
    return Math.min(3, prev ? prev.depth + 1 : 0);
  };
  const rowOver = (i) => (e) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const before = (e.clientY - r.top) < r.height / 2;
    const gap = before ? i : i + 1;
    const maxD = maxDepthAt(gap);
    const baseLeft = listRef.current ? listRef.current.getBoundingClientRect().left : r.left;
    let depth = Math.round((e.clientX - baseLeft - 44) / 22);   // 44 ≈ grip + number gutter
    depth = Math.max(0, Math.min(maxD, depth));
    setDropIdx(gap); setDropDepth(depth);
  };
  const doDrop = (e) => {
    if (e) e.preventDefault();
    if (drag !== null && dropIdx !== null) {
      let at = dropIdx; if (drag < dropIdx) at -= 1;
      const next = steps.slice(); const [x] = next.splice(drag, 1);
      next.splice(at, 0, { ...x, depth: dropDepth });
      onChange(next);
    }
    setDrag(null); setDropIdx(null);
  };
  const endDrag = () => { setDrag(null); setDropIdx(null); };

  return (
    <div className="section">
      <div className="section-h">
        <span className="ricon2" style={{ color: "var(--ink-3)" }}>{I.list({ size: 15 })}</span>
        <span className="sh-title">Steps</span>
        <span className="sh-mark">## Steps</span>
        <span className="sh-spacer" />
        <span className="muted" style={{ fontSize: 11 }}>Tab to nest · drag ↔ to re-parent</span>
      </div>
      <div className="item-list compact" ref={listRef} onDragOver={e => e.preventDefault()} onDrop={doDrop}>
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            {drag !== null && dropIdx === i && <div className="drop-line" style={{ marginLeft: dropDepth * 22 }} />}
            <div
              className={"litem step-litem" + (s.depth > 0 ? " sub" : "") + (drag === i ? " dragging" : "")}
              style={{ marginLeft: s.depth * 22 }}
              onDragOver={rowOver(i)} onDrop={doDrop}>
              <span className="grip" draggable onDragStart={() => setDrag(i)} onDragEnd={endDrag}>{I.drag({ size: 14 })}</span>
              <span className="step-num">{nums[i]}.</span>
              <input ref={el => refs.current[i] = el} className="li-input" value={s.text}
                placeholder="Describe the action…"
                onChange={e => setText(i, e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") { e.preventDefault(); addAfter(i); }
                  else if (e.key === "Tab") { e.preventDefault(); setDepth(i, s.depth + (e.shiftKey ? -1 : 1)); }
                  else if (e.key === "Backspace" && s.text === "" && steps.length > 1) { e.preventDefault(); remove(i); requestAnimationFrame(() => refs.current[Math.max(0, i - 1)] && refs.current[Math.max(0, i - 1)].focus()); }
                }} />
              <div className="step-actions">
                <button className="btn icon sm ghost" title="Outdent" disabled={s.depth === 0} onClick={() => setDepth(i, s.depth - 1)}>{I.outdent({ size: 14 })}</button>
                <button className="btn icon sm ghost" title="Indent" disabled={s.depth >= 3} onClick={() => setDepth(i, s.depth + 1)}>{I.indent({ size: 14 })}</button>
                <button className="btn icon sm ghost del" title="Remove" onClick={() => remove(i)}>{I.trash({ size: 13 })}</button>
              </div>
            </div>
          </React.Fragment>
        ))}
        {drag !== null && dropIdx === steps.length && <div className="drop-line" style={{ marginLeft: dropDepth * 22 }} />}
      </div>
      <button className="add-item" onClick={() => addAfter(steps.length - 1)}>{I.plus({ size: 14 })} Add step</button>
    </div>
  );
}

/* ---------- front-matter tag editor ---------- */
function TagEditor({ tags, onChange }) {
  const [adding, setAdding] = React.useState("");
  const commit = () => { const t = adding.trim().replace(/^#/, ""); if (t && !tags.includes(t)) onChange([...tags, t]); setAdding(""); };
  return (
    <div className="tags-edit">
      {tags.map(t => (
        <span key={t} className="tag-chip"><span className="mono" style={{ opacity: 0.6 }}>#</span>{t}
          <button onClick={() => onChange(tags.filter(x => x !== t))}>{I.x({ size: 11 })}</button>
        </span>
      ))}
      <input className="tag-add" placeholder="+ tag" value={adding}
        onChange={e => setAdding(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Backspace" && !adding && tags.length) onChange(tags.slice(0, -1)); }}
        onBlur={commit} />
    </div>
  );
}

/* ---------- the editor ---------- */
function CaseEditor() {
  const ctx = React.useContext(window.CW_CTX);
  const c = ctx.cases.find(x => x.id === ctx.sel.id);
  if (!c) return null;
  const patch = (p) => ctx.updateCase(c.id, p);
  const path = ctx.casePath(c);

  // a displayId is read-only unless it collides with another case in the workspace
  const clashes = ctx.cases.filter(x => x.id !== c.id && x.displayId.trim().toLowerCase() === c.displayId.trim().toLowerCase());
  const idConflict = clashes.length > 0;
  const nextFreeId = () => {
    const prefix = (c.displayId.split("-")[0] || ctx.workspace.prefix);
    const used = new Set(ctx.cases.map(x => x.displayId));
    const pad = s => `${prefix}-${String(s).padStart(4, "0")}`;
    let n = 1; while (used.has(pad(n))) n++; return pad(n);
  };

  return (
    <div className="center">
      <div className="editor-head">
        <div className="eh-top">
          <input className="eh-title-input" value={c.title} onChange={e => patch({ title: e.target.value })} placeholder="Untitled case" />
          <button className="btn sm ghost" title="Duplicate" onClick={() => ctx.duplicateCase(c.id)}>{I.copy({ size: 14 })} Duplicate</button>
          <button className="btn sm ghost danger" title="Delete" onClick={() => ctx.deleteCase(c.id)}>{I.trash({ size: 14 })}</button>
        </div>
        <div className="eh-meta">
          <div className="id-field">
            <span className="lbl">ID</span>
            {idConflict ? (
              <input className="input did-input conflict" value={c.displayId} autoFocus
                title="This ID conflicts — edit to resolve" onChange={e => patch({ displayId: e.target.value })} />
            ) : (
              <span className="ro" title="Human-facing ID · stable · editable only when it conflicts">
                {c.displayId}
                <button className="btn icon sm ghost" style={{ width: 18, height: 18 }} onClick={() => ctx.toast("Copied " + c.displayId)}>{I.copy({ size: 12 })}</button>
              </span>
            )}
          </div>
          <div className="id-field">
            <span className="lbl">Status</span>
            <select className={"status-select status-" + c.status} value={c.status} onChange={e => patch({ status: e.target.value })}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="deprecated">Deprecated</option>
            </select>
          </div>
          <span className="vr" />
          <div className="id-field" style={{ minWidth: 0, flex: 1 }}>
            <span className="lbl">Tags</span>
            <TagEditor tags={c.tags} onChange={t => patch({ tags: t })} />
          </div>
        </div>
        {idConflict && (
          <div className="id-conflict-bar">
            {I.warn({ size: 15 })}
            <span>Display ID <b>{c.displayId}</b> is already used by {clashes.length === 1 ? "another case" : clashes.length + " other cases"} ({clashes.map(x => x.title).join(", ")}). IDs must be unique — rename this one or pick the next free number.</span>
            <button className="btn sm" onClick={() => patch({ displayId: nextFreeId() })}>Use {nextFreeId()}</button>
          </div>
        )}
      </div>

      <div className="editor-scroll">
        <div className="editor-body">
          <ObjectiveEditor value={c.objective} onChange={v => patch({ objective: v })} />
          <hr className="divider" />
          <ListControl icon={I.layers({ size: 15 })} title="Systems in Scope" mark="## Systems in Scope" marker="–"
            items={c.systems} onChange={v => patch({ systems: v })} placeholder="System or component…" />
          <hr className="divider" />
          <StepsControl steps={c.steps} onChange={v => patch({ steps: v })} />
          <hr className="divider" />
          <ListControl icon={I.check({ size: 15 })} title="Expected Results" mark="## Expected Results" marker="–"
            items={c.expected} onChange={v => patch({ expected: v })} placeholder="Expected outcome…" />
          <div className="lint-note">{I.check({ size: 14 })} Round-trips to four reserved <span className="mono">##</span> sections · inline formatting only · single trailing newline.</div>
        </div>
      </div>

      <div className="editor-foot">
        <span className="ricon2">{I.file({ size: 13 })}</span>
        <span>{path}</span>
        <span style={{ marginLeft: "auto" }} className={c.modified ? "unsaved" : "saved"}>
          {c.modified ? <>{I.dot({ size: 9 })} uncommitted changes</> : <>{I.check({ size: 13 })} committed</>}
        </span>
      </div>
    </div>
  );
}
window.CaseEditor = CaseEditor;
window.numberSteps = numberSteps;
