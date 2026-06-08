/* Casewright — app root: store/context, window chrome, top bar, Git modals */
const e = React.createElement;
window.CW_CTX = React.createContext(null);

/* build suite path + case-collection helpers from the static tree */
function buildSuiteIndex(tree) {
  const path = {}; const childCases = {};
  const walk = (nodes) => nodes.forEach(n => {
    if (n.type === "suite") { path[n.id] = n.path; walk(n.children || []); }
  });
  walk(tree);
  const collect = (nodes, acc) => nodes.forEach(n => {
    if (n.type === "case") acc.push(n.id);
    else collect(n.children || [], acc);
  });
  const inSuite = (suiteId) => {
    const find = (nodes) => { for (const n of nodes) { if (n.type === "suite" && n.id === suiteId) return n; const r = n.children ? find(n.children) : null; if (r) return r; } return null; };
    const node = find(tree); const acc = []; if (node) collect(node.children || [], acc); return acc;
  };
  return { path, inSuite };
}

function App() {
  const data = window.CW;
  const hash = (location.hash || "").replace("#", "");
  const [screen, setScreen] = React.useState(hash === "merge" || hash === "runs" || hash === "run" || hash === "main" ? "main" : "launcher");
  const [cases, setCases] = React.useState(() => data.cases.map(c => ({ ...c })));
  const [tree, setTree] = React.useState(() => JSON.parse(JSON.stringify(data.tree)));
  const [runs, setRuns] = React.useState(() => data.runs.map(r => ({ ...r, rows: r.rows.map(x => ({ ...x })) })));
  const [workspace, setWorkspace] = React.useState(data.workspaces[0]);
  const [view, setView] = React.useState(hash === "runs" ? "runs" : hash === "run" ? "run" : "editor");          // editor | runs | run
  const [sel, setSel] = React.useState({ kind: "case", id: data.cases[0].id, runId: hash === "run" ? data.runs[0].id : null });
  const [changes, setChanges] = React.useState({});           // key -> {kind, refId, path, status, label}
  const [ahead, setAhead] = React.useState(1);
  const [behind, setBehind] = React.useState(3);
  const [branch] = React.useState("main");
  const [lastTester, setLastTester] = React.useState("amartin");
  const [modal, setModal] = React.useState(hash === "merge" ? "merge" : null);             // commit | createRun | merge
  const [wsOpen, setWsOpen] = React.useState(false);
  const [toasts, setToasts] = React.useState([]);
  const [collapsed, setCollapsed] = React.useState({});      // suiteId -> true when collapsed
  const [renaming, setRenaming] = React.useState(null);      // { id, value } for inline suite rename
  const setCollapsedOpen = (id) => { if (id) setCollapsed(s => ({ ...s, [id]: false })); };

  const suiteIdx = React.useMemo(() => buildSuiteIndex(tree), [tree]);

  const toast = (msg) => {
    const id = Math.random();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600);
  };

  const casePath = (c) => `${workspace.path}/${suiteIdx.path[c.suite] || c.suite}/${window.CWUtil.slug(c.title)}.md`;

  const addChange = (key, info) => setChanges(ch => ({ ...ch, [key]: { ...(ch[key] || {}), ...info } }));

  const updateCase = (id, patch) => {
    setCases(cs => cs.map(c => c.id === id ? { ...c, ...patch, modified: true } : c));
    const c = cases.find(x => x.id === id);
    if (c) {
      const merged = { ...c, ...patch };
      addChange("case:" + id, { kind: "case", refId: id, path: casePath(merged), status: changes["case:" + id]?.status === "A" ? "A" : "M", label: merged.title });
    }
  };

  const duplicateCase = (id) => {
    const src = cases.find(c => c.id === id); if (!src) return;
    const newId = Array.from({ length: 10 }, () => "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 36)]).join("");
    // a duplicate intentionally inherits the source displayId — the editor surfaces
    // the resulting ID conflict and lets the user decide how to renumber it.
    const dup = { ...src, id: newId, displayId: src.displayId, title: "Copy of " + src.title, modified: true,
      tags: [...src.tags], systems: [...src.systems], expected: [...src.expected], steps: src.steps.map(s => ({ ...s })) };
    setCases(cs => [...cs, dup]);
    addChange("case:" + newId, { kind: "case", refId: newId, path: casePath(dup), status: "A", label: dup.title });
    setSel({ kind: "case", id: newId, runId: null }); setView("editor");
    toast("Duplicated — resolve the display ID conflict");
  };

  const deleteCase = (id) => {
    const c = cases.find(x => x.id === id); if (!c) return;
    const used = runs.some(r => r.rows.some(row => row.case_id === id));
    if (!window.confirm(`Delete "${c.title}"?` + (used ? "\n\nThis case is referenced by a run — its snapshot rows are kept but will no longer resolve to a live file." : ""))) return;
    setCases(cs => cs.filter(x => x.id !== id));
    addChange("case:" + id, { kind: "case", refId: id, path: casePath(c), status: "D", label: c.title });
    const rest = cases.filter(x => x.id !== id);
    setSel({ kind: "case", id: rest[0]?.id, runId: null }); setView("editor");
    toast("Deleted " + c.displayId);
  };

  // ---- tree mutations: new suite / new case (root or nested) ----
  const insertIntoTree = (parentId, child) => {
    setTree(t => {
      const clone = JSON.parse(JSON.stringify(t));
      if (parentId == null) { clone.push(child); return clone; }
      const visit = (nodes) => nodes.some(n => {
        if (n.type === "suite" && n.id === parentId) { n.children = n.children || []; n.children.push(child); return true; }
        return n.children ? visit(n.children) : false;
      });
      visit(clone);
      return clone;
    });
  };
  const findSuite = (nodes, id) => { for (const n of nodes) { if (n.type === "suite" && n.id === id) return n; const r = n.children ? findSuite(n.children, id) : null; if (r) return r; } return null; };

  const createSuite = (parentId) => {
    const id = "suite-" + Math.random().toString(36).slice(2, 8);
    const parent = parentId ? findSuite(tree, parentId) : null;
    const name = "New Suite";
    const path = parent ? parent.path + "/" + name : name;
    insertIntoTree(parentId, { type: "suite", id, name, path, children: [] });
    setCollapsedOpen(parentId);
    setRenaming({ id, value: name });
    toast(parent ? `New suite in ${parent.name}` : "New top-level suite");
  };

  const createCase = (parentSuiteId) => {
    const newId = Array.from({ length: 10 }, () => "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 36)]).join("");
    const num = Math.max(0, ...cases.map(c => parseInt((c.displayId.split("-")[1]) || 0, 10) || 0)) + 1;
    const displayId = `${workspace.prefix}-${String(num).padStart(4, "0")}`;
    const kase = { id: newId, displayId, title: "Untitled case", status: "draft", tags: [],
      suite: parentSuiteId || (tree.find(n => n.type === "suite") || {}).id,
      objective: "", systems: [], steps: [{ text: "", depth: 0 }], expected: [""], modified: true };
    setCases(cs => [...cs, kase]);
    insertIntoTree(parentSuiteId || kase.suite, { type: "case", id: newId });
    addChange("case:" + newId, { kind: "case", refId: newId, path: casePath(kase), status: "A", label: kase.title });
    setCollapsedOpen(parentSuiteId || kase.suite);
    setSel({ kind: "case", id: newId, runId: null }); setView("editor");
    toast("New case · " + displayId);
  };

  const renameSuite = (id, name) => {
    setTree(t => {
      const clone = JSON.parse(JSON.stringify(t));
      const fix = (nodes, parentPath) => nodes.forEach(n => {
        if (n.type === "suite") {
          if (n.id === id) n.name = name;
          n.path = parentPath ? parentPath + "/" + n.name : n.name;
          if (n.children) fix(n.children, n.path);
        }
      });
      fix(clone, "");
      return clone;
    });
  };

  const deleteSuite = (id) => {
    const node = findSuite(tree, id); if (!node) return;
    const collect = (n, acc) => { (n.children || []).forEach(ch => { if (ch.type === "case") acc.push(ch.id); else collect(ch, acc); }); return acc; };
    const caseIds = collect(node, []);
    if (!window.confirm(`Delete suite "${node.name}"` + (caseIds.length ? ` and its ${caseIds.length} case(s)` : "") + "?")) return;
    setTree(t => {
      const clone = JSON.parse(JSON.stringify(t));
      const prune = (nodes) => { const i = nodes.findIndex(n => n.id === id); if (i !== -1) { nodes.splice(i, 1); return true; } return nodes.some(n => n.children && prune(n.children)); };
      prune(clone); return clone;
    });
    setCases(cs => cs.filter(c => !caseIds.includes(c.id)));
    toast(`Deleted suite "${node.name}"`);
  };

  // ---- move a node (case or suite) within the tree ----
  // target: { mode: "into", suiteId } | { mode: "before"|"after", nodeId }
  const isDescendant = (ancestorId, maybeChildId) => {
    const a = findSuite(tree, ancestorId); if (!a) return false;
    const walk = (n) => (n.children || []).some(ch => ch.id === maybeChildId || walk(ch));
    return walk(a);
  };
  const moveNode = (dragId, target) => {
    if (dragId === (target.nodeId || target.suiteId)) return;
    if (isDescendant(dragId, target.nodeId || target.suiteId)) return; // no suite into its own child

    setTree(t => {
      const clone = JSON.parse(JSON.stringify(t));
      // extract dragged node
      let dragged = null;
      const extract = (nodes) => { const i = nodes.findIndex(n => n.id === dragId); if (i !== -1) { dragged = nodes.splice(i, 1)[0]; return true; } return nodes.some(n => n.children && extract(n.children)); };
      extract(clone);
      if (!dragged) return t;
      // insert
      if (target.mode === "into") {
        if (target.suiteId != null) { const s = findSuite(clone, target.suiteId); s.children = s.children || []; s.children.push(dragged); }
        else clone.push(dragged);
      } else {
        const locate = (nodes) => { const i = nodes.findIndex(n => n.id === target.nodeId); if (i !== -1) { nodes.splice(target.mode === "after" ? i + 1 : i, 0, dragged); return true; } return nodes.some(n => n.children && locate(n.children)); };
        locate(clone);
      }
      // recompute suite paths + reassign case.suite by new parent
      const fix = (nodes, parentPath, parentSuiteId) => nodes.forEach(n => {
        if (n.type === "suite") { n.path = parentPath ? parentPath + "/" + n.name : n.name; fix(n.children || [], n.path, n.id); }
        else { movedCaseParent[n.id] = parentSuiteId; }
      });
      const movedCaseParent = {};
      fix(clone, "", null);
      // apply case.suite changes
      pendingCaseParents.current = movedCaseParent;
      return clone;
    });
  };
  const pendingCaseParents = React.useRef({});
  React.useEffect(() => {
    const map = pendingCaseParents.current;
    if (map && Object.keys(map).length) {
      setCases(cs => cs.map(c => map[c.id] && map[c.id] !== c.suite ? { ...c, suite: map[c.id], modified: true } : c));
      pendingCaseParents.current = {};
    }
  });

  // move a node to an explicit parent suite (null = root) at an explicit index
  const moveNodeToParent = (dragId, parentId, index) => {
    if (dragId === parentId) return;
    if (parentId && isDescendant(dragId, parentId)) return;
    setTree(t => {
      const clone = JSON.parse(JSON.stringify(t));
      let dragged = null;
      const extract = (nodes) => { const i = nodes.findIndex(n => n.id === dragId); if (i !== -1) { dragged = nodes.splice(i, 1)[0]; return true; } return nodes.some(n => n.children && extract(n.children)); };
      extract(clone);
      if (!dragged) return t;
      let arr;
      if (parentId == null) arr = clone;
      else { const s = findSuite(clone, parentId); if (!s) return t; s.children = s.children || []; arr = s.children; }
      const at = Math.max(0, Math.min(index, arr.length));
      arr.splice(at, 0, dragged);
      const movedCaseParent = {};
      const fix = (nodes, parentPath, parentSuiteId) => nodes.forEach(n => {
        if (n.type === "suite") { n.path = parentPath ? parentPath + "/" + n.name : n.name; fix(n.children || [], n.path, n.id); }
        else { movedCaseParent[n.id] = parentSuiteId; }
      });
      fix(clone, "", null);
      pendingCaseParents.current = movedCaseParent;
      return clone;
    });
  };

  const updateRunRow = (runId, i, patch) => {
    setRuns(rs => rs.map(r => r.id !== runId ? r : { ...r, rows: r.rows.map((row, j) => j === i ? { ...row, ...patch } : row) }));
    const run = runs.find(r => r.id === runId);
    if (run) addChange("run:" + runId, { kind: "run", refId: runId, path: workspace.path + "/" + run.file, status: "M", label: run.name });
  };

  const createRun = ({ name, scope, tag, suite }) => {
    const ids = scope === "tag" ? cases.filter(c => c.tags.includes(tag)).map(c => c.id)
      : scope === "suite" ? suiteIdx.inSuite(suite) : cases.map(c => c.id);
    const rows = ids.map(id => { const c = cases.find(x => x.id === id); return { case_id: id, display_id: c.displayId, title: c.title, result: "not_run", tester: "", executed_at: "", notes: "" }; });
    const slug = window.CWUtil.slug(name);
    const run = { id: "run-" + Math.random().toString(36).slice(2, 7), name, file: `runs/2026-06-01-${slug}.csv`, created: "2026-06-01", status: "open", scope, rows };
    setRuns(rs => [run, ...rs]);
    addChange("run:" + run.id, { kind: "run", refId: run.id, path: workspace.path + "/" + run.file, status: "A", label: run.name });
    setModal(null); setSel(s => ({ ...s, kind: "run", runId: run.id, guideIndex: 0 })); setView("guide");
    toast(`Created run · ${rows.length} cases seeded`);
  };

  const openCase = (id) => { setSel(s => ({ ...s, kind: "case", id })); setView("editor"); };
  const openRunsList = () => setView("runs");
  const openRun = (runId) => { setSel(s => ({ ...s, kind: "run", runId })); setView("run"); };
  const openCreateRun = () => setModal("createRun");
  const startGuide = (runId, index) => { setSel(s => ({ ...s, kind: "run", runId, guideIndex: index || 0 })); setView("guide"); };
  const guideGo = (index) => setSel(s => ({ ...s, guideIndex: index }));
  const exitGuide = () => setView("run");

  /* ---- git ---- */
  const changeList = Object.values(changes);
  const dirtyCount = changeList.length;

  const doCommit = (selectedKeys, msg) => {
    setCases(cs => cs.map(c => selectedKeys.includes("case:" + c.id) ? { ...c, modified: false } : c));
    setChanges(ch => { const next = { ...ch }; selectedKeys.forEach(k => delete next[k]); return next; });
    setAhead(a => a + 1); setModal(null);
    toast(`Committed ${selectedKeys.length} file(s)`);
  };
  const doPush = () => { if (!ahead) return; setAhead(0); toast(`Pushed to origin/${branch}`); };
  const doPull = () => { if (behind > 0) { setModal("merge"); } else { toast("Already up to date"); } };

  const completeMerge = (resolutions) => {
    applyMerge(resolutions);
    setBehind(0); setAhead(a => a + 1); setModal(null);
    toast("Merged origin/" + branch + " · merge commit created");
  };

  const applyMerge = (resolutions) => {
    const conflict = window.CW.conflict;
    conflict.files.forEach(file => {
      if (file.kind === "case") {
        const apply = {};
        file.elements.forEach(el => {
          const rk = file.path + "::" + el.key;
          let v;
          if (el.conflict) {
            const r = resolutions[rk]; if (!r) return;
            if (el.kind === "steps") v = r.text.split("\n").map(l => ({ text: l.trim(), depth: (l.match(/^ */)[0].length) / 2 || (l.match(/^\t*/)[0].length) }));
            else if (el.kind === "list") v = r.text.split("\n").filter(x => x.trim());
            else v = r.text;
          } else {
            if (el.auto === "same") return;
            if (el.kind === "tags") v = el.merged;
            else v = el.auto === "ours" ? el.ours : el.theirs;
          }
          const map = { title: "title", displayId: "displayId", status: "status", tags: "tags", objective: "objective", systems: "systems", steps: "steps", expected: "expected" };
          if (map[el.key]) apply[map[el.key]] = v;
        });
        setCases(cs => cs.map(c => c.id === file.caseId ? { ...c, ...apply } : c));
      } else if (file.kind === "run") {
        setRuns(rs => rs.map(run => {
          if (!run.file.endsWith(file.path.split("/").pop())) return run;
          return { ...run, rows: run.rows.map(row => {
            const rr = file.rows.find(x => x.case_id === row.case_id); if (!rr) return row;
            if (rr.conflict) { const r = resolutions[file.path + "::" + rr.case_id]; if (!r) return row; const v = r.choice === "ours" ? rr.ours : rr.theirs; return { ...row, ...v }; }
            if (rr.auto === "theirs") return { ...row, ...rr.value };
            return row;
          }) };
        }));
      }
    });
  };

  const ctx = {
    cases, runs, tree, workspace, workspaces: data.workspaces,
    sel, view, openCase, openRunsList, openRun, openCreateRun,
    startGuide, guideGo, exitGuide,
    updateCase, duplicateCase, deleteCase, updateRunRow, createRun,
    createSuite, createCase, renameSuite, deleteSuite, moveNode, moveNodeToParent,
    collapsed, setCollapsed, renaming, setRenaming,
    casePath, casesInSuite: suiteIdx.inSuite, toast,
    branch, ahead, behind, changes: changeList,
    lastTester, setLastTester,
  };

  if (screen === "launcher") {
    return e("div", { className: "desk" },
      e("div", { className: "window" },
        e(TitleBar, { subtitle: "Open a repository" }),
        e(Launcher, { onOpen: () => { setScreen("main"); } })
      ));
  }

  return e(window.CW_CTX.Provider, { value: ctx },
    e("div", { className: "desk" },
      e("div", { className: "window" },
        e(TitleBar, { subtitle: `${workspace.name} · ${branch}` }),
        e(TopBar, { wsOpen, setWsOpen, setWorkspace, onCommit: () => setModal("commit"), onPush: doPush, onPull: doPull, onHome: () => setScreen("launcher") }),
        e("div", { className: "shell" },
          e("div", { className: "workspace" },
            e(Sidebar, null),
            view === "runs" ? e(RunsList, null)
              : view === "guide" ? e(RunGuide, null)
              : view === "run" ? e(RunGrid, null)
                : sel.id ? e(CaseEditor, null)
                  : e(EmptyCenter, null)
          )
        ),
        modal === "commit" && e(CommitModal, { onClose: () => setModal(null), changes: changeList, onCommit: doCommit }),
        modal === "createRun" && e(CreateRunModal, { onClose: () => setModal(null) }),
        modal === "merge" && e(MergeResolver, { onComplete: completeMerge, onCancel: () => setModal(null) }),
        e(Toasts, { toasts })
      )
    ));
}

/* ---- chrome bits ---- */
function TitleBar({ subtitle }) {
  return e("div", { className: "titlebar" },
    e("div", { className: "traffic" }, e("i", { className: "r" }), e("i", { className: "y" }), e("i", { className: "g" })),
    e("div", { className: "wintitle" }, I.repo({ size: 13 }), e("b", null, "Casewright"), subtitle ? " — " + subtitle : "")
  );
}

function TopBar({ wsOpen, setWsOpen, setWorkspace, onCommit, onPush, onPull, onHome }) {
  const ctx = React.useContext(window.CW_CTX);
  const { workspace, workspaces, branch, ahead, behind, changes } = ctx;
  const dirty = changes.length;
  return e("div", { className: "topbar" },
    e("button", { className: "btn icon ghost", title: "Repositories", onClick: onHome }, I.repo({ size: 16 })),
    e("div", { className: "crumb", style: { position: "relative" } },
      e("div", { className: "ws-switch", onClick: () => setWsOpen(!wsOpen) },
        e("span", { className: "repo-glyph" }, e("svg", { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "#fff", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" }, e("path", { d: "M4 5h11l5 5v9H4z" }), e("path", { d: "M15 5v5h5" }))),
        e("span", { className: "ws-repo" }, "qa-testcases /"),
        e("span", { className: "ws-name" }, e("b", null, workspace.name)),
        I.chevronDown({ size: 13 })
      ),
      wsOpen && e(React.Fragment, null,
        e("div", { style: { position: "fixed", inset: 0, zIndex: 20 }, onClick: () => setWsOpen(false) }),
        e("div", { className: "res-pop", style: { top: 40, left: 0, zIndex: 30, minWidth: 240 } },
          e("div", { className: "mf-group-h" }, "Workspaces · casewright.json"),
          workspaces.map(w => e("button", { key: w.id, className: "res-opt", onClick: () => { setWorkspace(w); setWsOpen(false); ctx.toast("Switched to " + w.name); } },
            I.folder({ size: 14 }),
            e("div", { style: { flex: 1 } }, e("div", { style: { fontWeight: 600 } }, w.name), e("div", { className: "mono", style: { fontSize: 11, color: "var(--ink-faint)" } }, w.path)),
            w.id === workspace.id && e("span", { style: { color: "var(--accent)" } }, I.check({ size: 13 }))
          ))
        )
      )
    ),
    e("span", { className: "branch-chip" }, I.branch({ size: 13 }), branch,
      (ahead || behind) && e("span", { className: "ab" + (dirty ? " dirty" : "") },
        behind ? e("span", null, "↓" + behind) : null,
        ahead ? e("span", null, "↑" + ahead) : null),
      dirty ? e("span", { className: "ab dirty", title: dirty + " uncommitted file(s)" }, e("span", { className: "dirty-dot" }), dirty) : null
    ),
    e("div", { className: "git-actions" },
      e("button", { className: "btn", onClick: onPull }, I.pull({ size: 15 }), "Pull", behind ? e("span", { className: "count-pill warn" }, behind) : null),
      e("button", { className: "btn", onClick: onCommit }, I.commit({ size: 15 }), "Commit", dirty ? e("span", { className: "count-pill" }, dirty) : null),
      e("button", { className: "btn primary", onClick: onPush, disabled: !ahead }, I.push({ size: 15 }), "Push", ahead ? e("span", { className: "count-pill", style: { background: "oklch(1 0 0 / 0.22)", color: "#fff" } }, ahead) : null)
    )
  );
}

function EmptyCenter() {
  return e("div", { className: "center" }, e("div", { className: "empty-center" },
    e("div", { className: "ec-inner" },
      I.file({ size: 30, style: { color: "var(--ink-faint)" } }),
      e("div", { style: { fontSize: 14, color: "var(--ink-3)" } }, "Select a case from the tree, or create a new one."),
      e("button", { className: "btn primary" }, I.plus({ size: 14 }), "New case")
    )));
}

/* ---- commit modal ---- */
function CommitModal({ onClose, changes, onCommit }) {
  function keyOf(c) { return c.kind + ":" + c.refId; }
  const [sel, setSel] = React.useState(() => changes.reduce((a, c) => (a[keyOf(c)] = true, a), {}));
  const [msg, setMsg] = React.useState("");
  const toggle = (k) => setSel(s => ({ ...s, [k]: !s[k] }));
  const selectedKeys = changes.filter(c => sel[keyOf(c)]).map(keyOf);
  const n = selectedKeys.length;

  return e("div", { className: "scrim", onClick: onClose },
    e("div", { className: "modal", onClick: ev => ev.stopPropagation() },
      e("div", { className: "modal-head" }, e("span", { className: "ricon2", style: { color: "var(--accent)" } }, I.commit({ size: 18 })), e("h3", null, "Commit changes"),
        e("span", { className: "tag", style: { marginLeft: "auto" } }, n + " of " + changes.length + " staged")),
      e("div", { className: "modal-body", style: { display: "flex", flexDirection: "column", gap: 14 } },
        changes.length === 0
          ? e("div", { className: "lint-note" }, I.check({ size: 14 }), "Working tree clean — nothing to commit.")
          : e(React.Fragment, null,
            e("div", { className: "commit-files" },
              changes.map(c => { const k = keyOf(c); return e("div", { key: k, className: "cf-row", onClick: () => toggle(k) },
                e("span", { className: "cf-check" + (sel[k] ? " on" : "") }, I.check({ size: 12 })),
                e("span", { className: "cf-stat " + c.status }, c.status),
                e("span", { className: "cf-path" }, e("span", { className: "dir" }, c.path.replace(/\/[^/]+$/, "/")), c.path.split("/").pop())
              ); })
            ),
            e("div", { className: "field" }, e("label", null, "Message"),
              e("textarea", { className: "textarea", rows: 3, placeholder: "Describe what changed…", value: msg, onChange: ev => setMsg(ev.target.value), style: { fontFamily: "var(--font-mono)", fontSize: 12.5 } }))
          )
      ),
      e("div", { className: "modal-foot" },
        e("span", { className: "muted", style: { marginRight: "auto", fontSize: 12 } }, I.branch({ size: 13 }), " main"),
        e("button", { className: "btn ghost", onClick: onClose }, "Cancel"),
        e("button", { className: "btn primary", disabled: n === 0 || !msg.trim(), onClick: () => onCommit(selectedKeys, msg) }, I.commit({ size: 14 }), `Commit ${n} file${n === 1 ? "" : "s"}`)
      )
    ));
}

function Toasts({ toasts }) {
  return e("div", { className: "toast-wrap" },
    toasts.map(t => e("div", { key: t.id, className: "toast ok" }, e("span", { className: "tt-icon" }, I.check({ size: 15 })), t.msg)));
}

ReactDOM.createRoot(document.getElementById("root")).render(e(App));
