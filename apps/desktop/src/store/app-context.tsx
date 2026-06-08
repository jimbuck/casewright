import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

import * as sample from '@/data/sample';
import { randomId, slug } from '@/utils/ids';
import type {
  Case,
  Change,
  CreateRunArgs,
  ModalKind,
  Renaming,
  Resolutions,
  Run,
  RunRow,
  Screen,
  Selection,
  Step,
  Toast,
  TreeNode,
  View,
  Workspace,
} from '@/types';

/* ---- suite-path + case-collection helpers from a tree ---- */
function buildSuiteIndex(tree: TreeNode[]) {
  const path: Record<string, string> = {};
  const walk = (nodes: TreeNode[]) =>
    nodes.forEach((n) => {
      if (n.type === 'suite') {
        path[n.id] = n.path;
        walk(n.children);
      }
    });
  walk(tree);

  const collect = (nodes: TreeNode[], acc: string[]) =>
    nodes.forEach((n) => {
      if (n.type === 'case') acc.push(n.id);
      else collect(n.children, acc);
    });

  const findSuite = (nodes: TreeNode[], id: string): TreeNode | null => {
    for (const n of nodes) {
      if (n.type === 'suite' && n.id === id) return n;
      const r = n.type === 'suite' ? findSuite(n.children, id) : null;
      if (r) return r;
    }
    return null;
  };

  const inSuite = (suiteId: string): string[] => {
    const node = findSuite(tree, suiteId);
    const acc: string[] = [];
    if (node && node.type === 'suite') collect(node.children, acc);
    return acc;
  };

  return { path, inSuite };
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const findSuiteNode = (nodes: TreeNode[], id: string): Extract<TreeNode, { type: 'suite' }> | null => {
  for (const n of nodes) {
    if (n.type === 'suite' && n.id === id) return n;
    const r = n.type === 'suite' ? findSuiteNode(n.children, id) : null;
    if (r) return r;
  }
  return null;
};

export interface AppContextValue {
  /* data */
  cases: Case[];
  runs: Run[];
  tree: TreeNode[];
  workspace: Workspace;
  workspaces: Workspace[];

  /* navigation / selection */
  screen: Screen;
  view: View;
  sel: Selection;
  openRepo: () => void;
  goHome: () => void;
  setWorkspace: (w: Workspace) => void;
  openCase: (id: string) => void;
  openRunsList: () => void;
  openRun: (runId: string) => void;
  openCreateRun: () => void;
  startGuide: (runId: string, index?: number) => void;
  guideGo: (index: number) => void;
  exitGuide: () => void;

  /* case + suite mutations */
  updateCase: (id: string, patch: Partial<Case>) => void;
  duplicateCase: (id: string) => void;
  deleteCase: (id: string) => void;
  createCase: (parentSuiteId: string | null) => void;
  createSuite: (parentId: string | null) => void;
  renameSuite: (id: string, name: string) => void;
  deleteSuite: (id: string) => void;
  moveNodeToParent: (dragId: string, parentId: string | null, index: number) => void;

  /* runs */
  updateRunRow: (runId: string, i: number, patch: Partial<RunRow>) => void;
  createRun: (args: CreateRunArgs) => void;
  lastTester: string;
  setLastTester: (v: string) => void;

  /* tree ui state */
  collapsed: Record<string, boolean>;
  setCollapsed: Dispatch<SetStateAction<Record<string, boolean>>>;
  renaming: Renaming | null;
  setRenaming: Dispatch<SetStateAction<Renaming | null>>;

  /* derived helpers */
  casePath: (c: Case) => string;
  casesInSuite: (suiteId: string) => string[];
  toast: (msg: string) => void;
  toasts: Toast[];

  /* git */
  branch: string;
  ahead: number;
  behind: number;
  changes: Change[];
  doCommit: (selectedKeys: string[], msg: string) => void;
  doPush: () => void;
  doPull: () => void;
  completeMerge: (resolutions: Resolutions) => void;

  /* modals */
  modal: ModalKind;
  setModal: Dispatch<SetStateAction<ModalKind>>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within <AppProvider>');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>('launcher');
  const [cases, setCases] = useState<Case[]>(() => sample.cases.map((c) => ({ ...c })));
  const [tree, setTree] = useState<TreeNode[]>(() => clone(sample.tree));
  const [runs, setRuns] = useState<Run[]>(() =>
    sample.runs.map((r) => ({ ...r, rows: r.rows.map((x) => ({ ...x })) })),
  );
  const [workspace, setWorkspace] = useState<Workspace>(sample.workspaces[0]);
  const [view, setView] = useState<View>('editor');
  const [sel, setSel] = useState<Selection>({ kind: 'case', id: sample.cases[0].id, runId: null });
  const [changes, setChanges] = useState<Record<string, Change>>({});
  const [ahead, setAhead] = useState(1);
  const [behind, setBehind] = useState(3);
  const [branch] = useState('main');
  const [lastTester, setLastTester] = useState('amartin');
  const [modal, setModal] = useState<ModalKind>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [renaming, setRenaming] = useState<Renaming | null>(null);

  const suiteIdx = useMemo(() => buildSuiteIndex(tree), [tree]);
  const setCollapsedOpen = useCallback((id: string | null) => {
    if (id) setCollapsed((s) => ({ ...s, [id]: false }));
  }, []);

  const toast = useCallback((msg: string) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const casePath = useCallback(
    (c: Case) => `${workspace.path}/${suiteIdx.path[c.suite] || c.suite}/${slug(c.title)}.md`,
    [workspace, suiteIdx],
  );

  const addChange = useCallback((key: string, info: Change) => {
    setChanges((ch) => ({ ...ch, [key]: { ...(ch[key] ?? {}), ...info } }));
  }, []);

  /* ---- case mutations ---- */
  const updateCase = useCallback(
    (id: string, patch: Partial<Case>) => {
      setCases((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch, modified: true } : c)));
      const c = cases.find((x) => x.id === id);
      if (c) {
        const merged = { ...c, ...patch };
        addChange('case:' + id, {
          kind: 'case',
          refId: id,
          path: casePath(merged),
          status: changes['case:' + id]?.status === 'A' ? 'A' : 'M',
          label: merged.title,
        });
      }
    },
    [cases, changes, casePath, addChange],
  );

  const duplicateCase = useCallback(
    (id: string) => {
      const src = cases.find((c) => c.id === id);
      if (!src) return;
      const newId = randomId();
      // a duplicate intentionally inherits the source displayId — the editor surfaces
      // the resulting ID conflict and lets the user decide how to renumber it.
      const dup: Case = {
        ...src,
        id: newId,
        displayId: src.displayId,
        title: 'Copy of ' + src.title,
        modified: true,
        tags: [...src.tags],
        systems: [...src.systems],
        expected: [...src.expected],
        steps: src.steps.map((s) => ({ ...s })),
      };
      setCases((cs) => [...cs, dup]);
      addChange('case:' + newId, { kind: 'case', refId: newId, path: casePath(dup), status: 'A', label: dup.title });
      setSel({ kind: 'case', id: newId, runId: null });
      setView('editor');
      toast('Duplicated — resolve the display ID conflict');
    },
    [cases, addChange, casePath, toast],
  );

  const deleteCase = useCallback(
    (id: string) => {
      const c = cases.find((x) => x.id === id);
      if (!c) return;
      const used = runs.some((r) => r.rows.some((row) => row.case_id === id));
      if (
        !window.confirm(
          `Delete "${c.title}"?` +
            (used
              ? '\n\nThis case is referenced by a run — its snapshot rows are kept but will no longer resolve to a live file.'
              : ''),
        )
      )
        return;
      setCases((cs) => cs.filter((x) => x.id !== id));
      addChange('case:' + id, { kind: 'case', refId: id, path: casePath(c), status: 'D', label: c.title });
      const rest = cases.filter((x) => x.id !== id);
      setSel({ kind: 'case', id: rest[0]?.id, runId: null });
      setView('editor');
      toast('Deleted ' + c.displayId);
    },
    [cases, runs, addChange, casePath, toast],
  );

  /* ---- tree mutations ---- */
  const insertIntoTree = useCallback((parentId: string | null, child: TreeNode) => {
    setTree((t) => {
      const next = clone(t);
      if (parentId == null) {
        next.push(child);
        return next;
      }
      const s = findSuiteNode(next, parentId);
      if (s) s.children.push(child);
      return next;
    });
  }, []);

  const createSuite = useCallback(
    (parentId: string | null) => {
      const id = 'suite-' + randomId(6);
      const parent = parentId ? findSuiteNode(tree, parentId) : null;
      const name = 'New Suite';
      const path = parent ? parent.path + '/' + name : name;
      insertIntoTree(parentId, { type: 'suite', id, name, path, children: [] });
      setCollapsedOpen(parentId);
      setRenaming({ id, value: name });
      toast(parent ? `New suite in ${parent.name}` : 'New top-level suite');
    },
    [tree, insertIntoTree, setCollapsedOpen, toast],
  );

  const createCase = useCallback(
    (parentSuiteId: string | null) => {
      const newId = randomId();
      const num =
        Math.max(0, ...cases.map((c) => parseInt(c.displayId.split('-')[1] ?? '0', 10) || 0)) + 1;
      const displayId = `${workspace.prefix}-${String(num).padStart(4, '0')}`;
      const firstSuite = tree.find((n) => n.type === 'suite');
      const suite = parentSuiteId ?? (firstSuite ? firstSuite.id : '');
      const kase: Case = {
        id: newId,
        displayId,
        title: 'Untitled case',
        status: 'draft',
        tags: [],
        suite,
        objective: '',
        systems: [],
        steps: [{ text: '', depth: 0 }],
        expected: [''],
        modified: true,
      };
      setCases((cs) => [...cs, kase]);
      insertIntoTree(suite, { type: 'case', id: newId });
      addChange('case:' + newId, { kind: 'case', refId: newId, path: casePath(kase), status: 'A', label: kase.title });
      setCollapsedOpen(suite);
      setSel({ kind: 'case', id: newId, runId: null });
      setView('editor');
      toast('New case · ' + displayId);
    },
    [cases, tree, workspace, insertIntoTree, addChange, casePath, setCollapsedOpen, toast],
  );

  const renameSuite = useCallback((id: string, name: string) => {
    setTree((t) => {
      const next = clone(t);
      const fix = (nodes: TreeNode[], parentPath: string) =>
        nodes.forEach((n) => {
          if (n.type === 'suite') {
            if (n.id === id) n.name = name;
            n.path = parentPath ? parentPath + '/' + n.name : n.name;
            fix(n.children, n.path);
          }
        });
      fix(next, '');
      return next;
    });
  }, []);

  const isDescendant = useCallback(
    (ancestorId: string, maybeChildId: string) => {
      const a = findSuiteNode(tree, ancestorId);
      if (!a) return false;
      const walk = (n: TreeNode): boolean =>
        n.type === 'suite' && n.children.some((ch) => ch.id === maybeChildId || walk(ch));
      return walk(a);
    },
    [tree],
  );

  const deleteSuite = useCallback(
    (id: string) => {
      const node = findSuiteNode(tree, id);
      if (!node) return;
      const collectCases = (n: TreeNode, acc: string[]): string[] => {
        if (n.type === 'suite')
          n.children.forEach((ch) => (ch.type === 'case' ? acc.push(ch.id) : collectCases(ch, acc)));
        return acc;
      };
      const caseIds = collectCases(node, []);
      if (
        !window.confirm(
          `Delete suite "${node.name}"` + (caseIds.length ? ` and its ${caseIds.length} case(s)` : '') + '?',
        )
      )
        return;
      setTree((t) => {
        const next = clone(t);
        const prune = (nodes: TreeNode[]): boolean => {
          const i = nodes.findIndex((n) => n.id === id);
          if (i !== -1) {
            nodes.splice(i, 1);
            return true;
          }
          return nodes.some((n) => n.type === 'suite' && prune(n.children));
        };
        prune(next);
        return next;
      });
      setCases((cs) => cs.filter((c) => !caseIds.includes(c.id)));
      toast(`Deleted suite "${node.name}"`);
    },
    [tree, toast],
  );

  // apply queued case→suite reassignments after a tree move
  const pendingCaseParents = useRef<Record<string, string | null>>({});
  useEffect(() => {
    const map = pendingCaseParents.current;
    if (map && Object.keys(map).length) {
      setCases((cs) =>
        cs.map((c) => (map[c.id] && map[c.id] !== c.suite ? { ...c, suite: map[c.id] as string, modified: true } : c)),
      );
      pendingCaseParents.current = {};
    }
  });

  const moveNodeToParent = useCallback(
    (dragId: string, parentId: string | null, index: number) => {
      if (dragId === parentId) return;
      if (parentId && isDescendant(dragId, parentId)) return;
      setTree((t) => {
        const next = clone(t);
        let dragged: TreeNode | null = null;
        const extract = (nodes: TreeNode[]): boolean => {
          const i = nodes.findIndex((n) => n.id === dragId);
          if (i !== -1) {
            dragged = nodes.splice(i, 1)[0];
            return true;
          }
          return nodes.some((n) => n.type === 'suite' && extract(n.children));
        };
        extract(next);
        if (!dragged) return t;
        let arr: TreeNode[];
        if (parentId == null) arr = next;
        else {
          const s = findSuiteNode(next, parentId);
          if (!s) return t;
          arr = s.children;
        }
        const at = Math.max(0, Math.min(index, arr.length));
        arr.splice(at, 0, dragged);
        const movedCaseParent: Record<string, string | null> = {};
        const fix = (nodes: TreeNode[], parentPath: string, parentSuiteId: string | null) =>
          nodes.forEach((n) => {
            if (n.type === 'suite') {
              n.path = parentPath ? parentPath + '/' + n.name : n.name;
              fix(n.children, n.path, n.id);
            } else {
              movedCaseParent[n.id] = parentSuiteId;
            }
          });
        fix(next, '', null);
        pendingCaseParents.current = movedCaseParent;
        return next;
      });
    },
    [isDescendant],
  );

  /* ---- runs ---- */
  const updateRunRow = useCallback(
    (runId: string, i: number, patch: Partial<RunRow>) => {
      setRuns((rs) =>
        rs.map((r) => (r.id !== runId ? r : { ...r, rows: r.rows.map((row, j) => (j === i ? { ...row, ...patch } : row)) })),
      );
      const run = runs.find((r) => r.id === runId);
      if (run)
        addChange('run:' + runId, {
          kind: 'run',
          refId: runId,
          path: workspace.path + '/' + run.file,
          status: 'M',
          label: run.name,
        });
    },
    [runs, workspace, addChange],
  );

  const createRun = useCallback(
    ({ name, scope, tag, suite }: CreateRunArgs) => {
      const ids =
        scope === 'tag'
          ? cases.filter((c) => c.tags.includes(tag)).map((c) => c.id)
          : scope === 'suite'
            ? suiteIdx.inSuite(suite)
            : cases.map((c) => c.id);
      const rows: RunRow[] = ids.map((id) => {
        const c = cases.find((x) => x.id === id)!;
        return { case_id: id, display_id: c.displayId, title: c.title, result: 'not_run', tester: '', executed_at: '', notes: '' };
      });
      const run: Run = {
        id: 'run-' + randomId(5),
        name,
        file: `runs/2026-06-01-${slug(name)}.csv`,
        created: '2026-06-01',
        status: 'open',
        scope,
        rows,
      };
      setRuns((rs) => [run, ...rs]);
      addChange('run:' + run.id, { kind: 'run', refId: run.id, path: workspace.path + '/' + run.file, status: 'A', label: run.name });
      setModal(null);
      setSel((s) => ({ ...s, kind: 'run', runId: run.id, guideIndex: 0 }));
      setView('guide');
      toast(`Created run · ${rows.length} cases seeded`);
    },
    [cases, suiteIdx, workspace, addChange, toast],
  );

  /* ---- navigation ---- */
  const openRepo = useCallback(() => setScreen('main'), []);
  const goHome = useCallback(() => setScreen('launcher'), []);
  const openCase = useCallback((id: string) => {
    setSel((s) => ({ ...s, kind: 'case', id }));
    setView('editor');
  }, []);
  const openRunsList = useCallback(() => setView('runs'), []);
  const openRun = useCallback((runId: string) => {
    setSel((s) => ({ ...s, kind: 'run', runId }));
    setView('run');
  }, []);
  const openCreateRun = useCallback(() => setModal('createRun'), []);
  const startGuide = useCallback((runId: string, index = 0) => {
    setSel((s) => ({ ...s, kind: 'run', runId, guideIndex: index }));
    setView('guide');
  }, []);
  const guideGo = useCallback((index: number) => setSel((s) => ({ ...s, guideIndex: index })), []);
  const exitGuide = useCallback(() => setView('run'), []);

  /* ---- git ---- */
  const changeList = useMemo(() => Object.values(changes), [changes]);

  const doCommit = useCallback((selectedKeys: string[], _msg: string) => {
    setCases((cs) => cs.map((c) => (selectedKeys.includes('case:' + c.id) ? { ...c, modified: false } : c)));
    setChanges((ch) => {
      const next = { ...ch };
      selectedKeys.forEach((k) => delete next[k]);
      return next;
    });
    setAhead((a) => a + 1);
    setModal(null);
    toast(`Committed ${selectedKeys.length} file(s)`);
  }, [toast]);

  const doPush = useCallback(() => {
    if (!ahead) return;
    setAhead(0);
    toast(`Pushed to origin/${branch}`);
  }, [ahead, branch, toast]);

  const doPull = useCallback(() => {
    if (behind > 0) setModal('merge');
    else toast('Already up to date');
  }, [behind, toast]);

  const applyMerge = useCallback((resolutions: Resolutions) => {
    sample.conflict.files.forEach((file) => {
      if (file.kind === 'case') {
        const apply: Partial<Case> = {};
        file.elements.forEach((el) => {
          const rk = file.path + '::' + el.key;
          let v: unknown;
          if (el.conflict) {
            const r = resolutions[rk];
            if (!r || r.text == null) return;
            if (el.kind === 'steps') {
              v = r.text.split('\n').map((l): Step => {
                const spaces = l.match(/^ */)?.[0].length ?? 0;
                const tabs = l.match(/^\t*/)?.[0].length ?? 0;
                return { text: l.trim(), depth: Math.floor(spaces / 2) || tabs };
              });
            } else if (el.kind === 'list') {
              v = r.text.split('\n').filter((x) => x.trim());
            } else {
              v = r.text;
            }
          } else {
            if (el.auto === 'same') return;
            if (el.kind === 'tags') v = el.merged;
            else v = el.auto === 'ours' ? el.ours : el.theirs;
          }
          (apply as Record<string, unknown>)[el.key] = v;
        });
        setCases((cs) => cs.map((c) => (c.id === file.caseId ? { ...c, ...apply } : c)));
      } else {
        setRuns((rs) =>
          rs.map((run) => {
            const fileName = file.path.split('/').pop() ?? '';
            if (!run.file.endsWith(fileName)) return run;
            return {
              ...run,
              rows: run.rows.map((row) => {
                const rr = file.rows.find((x) => x.case_id === row.case_id);
                if (!rr) return row;
                if (rr.conflict) {
                  const r = resolutions[file.path + '::' + rr.case_id];
                  if (!r) return row;
                  const v = r.choice === 'ours' ? rr.ours : rr.theirs;
                  return v ? { ...row, ...v } : row;
                }
                if (rr.auto === 'theirs' && rr.value) return { ...row, ...rr.value };
                return row;
              }),
            };
          }),
        );
      }
    });
  }, []);

  const completeMerge = useCallback(
    (resolutions: Resolutions) => {
      applyMerge(resolutions);
      setBehind(0);
      setAhead((a) => a + 1);
      setModal(null);
      toast('Merged origin/' + branch + ' · merge commit created');
    },
    [applyMerge, branch, toast],
  );

  const value: AppContextValue = {
    cases,
    runs,
    tree,
    workspace,
    workspaces: sample.workspaces,
    screen,
    view,
    sel,
    openRepo,
    goHome,
    setWorkspace,
    openCase,
    openRunsList,
    openRun,
    openCreateRun,
    startGuide,
    guideGo,
    exitGuide,
    updateCase,
    duplicateCase,
    deleteCase,
    createCase,
    createSuite,
    renameSuite,
    deleteSuite,
    moveNodeToParent,
    updateRunRow,
    createRun,
    lastTester,
    setLastTester,
    collapsed,
    setCollapsed,
    renaming,
    setRenaming,
    casePath,
    casesInSuite: suiteIdx.inSuite,
    toast,
    toasts,
    branch,
    ahead,
    behind,
    changes: changeList,
    doCommit,
    doPush,
    doPull,
    completeMerge,
    modal,
    setModal,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
