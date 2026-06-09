import type { Dispatch, SetStateAction } from 'react';
import { create } from 'zustand';

import { serializeCase } from '@/services/format/case';
import { caseFileName, runFileStem } from '@/services/format/filename';
import { serializeRunCsv, serializeRunSidecar } from '@/services/format/run';
import { serializeWorkspaceYaml } from '@/services/format/workspace';
import {
  deletePath,
  loadRepo,
  makeDir,
  openRepo as openRepoSvc,
  relJoin,
  renamePath,
  writeFileAt,
} from '@/services/repo';
import { addRecent, listRecents } from '@/services/recents';
import { flushPersist, schedulePersist } from '@/services/persist';
import {
  abortMerge as gitAbortMerge,
  GitAuthError,
  pull as gitPull,
  push as gitPush,
  stageAndCommit,
  status as gitStatus,
} from '@/services/git';
import type { LintWarning } from '@/schemas';
import { randomId, slug } from '@/utils/ids';
import { pickDirectory } from '@/lib/nwjs';
import type {
  Case,
  Change,
  Conflict,
  CreateRunArgs,
  ModalKind,
  Recent,
  Renaming,
  Resolutions,
  Run,
  RunRow,
  Screen,
  Selection,
  Step,
  SuiteNode,
  Toast,
  TreeNode,
  View,
  Workspace,
} from '@/types';

const baseName = (p: string): string => p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || p;

/* ---- tree helpers ---- */
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
    nodes.forEach((n) => (n.type === 'case' ? acc.push(n.id) : collect(n.children, acc)));

  const inSuite = (suiteId: string): string[] => {
    const node = findSuiteNode(tree, suiteId);
    const acc: string[] = [];
    if (node) collect(node.children, acc);
    return acc;
  };

  return { path, inSuite };
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function findSuiteNode(nodes: TreeNode[], id: string): SuiteNode | null {
  for (const n of nodes) {
    if (n.type === 'suite' && n.id === id) return n;
    const r = n.type === 'suite' ? findSuiteNode(n.children, id) : null;
    if (r) return r;
  }
  return null;
}

function isDescendant(tree: TreeNode[], ancestorId: string, childId: string): boolean {
  const a = findSuiteNode(tree, ancestorId);
  if (!a) return false;
  const walk = (n: TreeNode): boolean =>
    n.type === 'suite' && n.children.some((ch) => ch.id === childId || walk(ch));
  return walk(a);
}

export interface AppState {
  /* data */
  cases: Case[];
  runs: Run[];
  tree: TreeNode[];
  workspace: Workspace | null;
  workspaces: Workspace[];

  /* repo / loading */
  repoPath: string;
  loading: boolean;
  error: string | null;
  warnings: LintWarning[];
  recents: Recent[];
  loadRecents: () => Promise<void>;

  /* navigation / selection */
  screen: Screen;
  view: View;
  sel: Selection;
  openRepo: (path?: string) => Promise<void>;
  goHome: () => void;
  setWorkspace: (w: Workspace) => Promise<void>;
  updateWorkspace: (wsId: string, patch: Partial<Workspace>) => void;
  openCase: (id: string) => void;
  openSuite: (suiteId: string) => void;
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

  /* tree ui state (React-style setters for component compatibility) */
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
  gitBusy: boolean;
  /** Set when a pull produced conflicts (structured resolver deferred — resolve via Git or abort). */
  mergeBanner: string | null;
  /** Populated by the (deferred) structured 3-way merge engine; null until then. */
  conflict: Conflict | null;
  refreshStatus: () => Promise<void>;
  doCommit: (selectedKeys: string[], msg: string) => void;
  doPush: () => Promise<void>;
  doPull: () => Promise<void>;
  abortMerge: () => Promise<void>;
  completeMerge: (resolutions: Resolutions) => void;

  /* modals */
  modal: ModalKind;
  setModal: (modal: ModalKind) => void;
}

const changeKey = (c: Change) => c.kind + ':' + c.refId;

export const useAppStore = create<AppState>()((set, get) => {
  // suite paths in the tree are full repo-relative (workspaces are top-level folders)
  const casePath = (c: Case): string => {
    const dir = buildSuiteIndex(get().tree).path[c.suite] ?? '';
    return dir ? `${dir}/${caseFileName(c)}` : caseFileName(c);
  };

  /* ---- disk persistence (optimistic in-memory + write; reload on error) ---- */
  const suiteRel = (suiteId: string): string => buildSuiteIndex(get().tree).path[suiteId] ?? '';
  const runRel = (run: Run): string => run.file; // already full repo-relative

  /** The workspace owning a given repo-relative path (longest matching prefix). The
   *  repo-root workspace (`path === ''`) owns everything; a more specific workspace wins. */
  const workspaceOfPath = (full: string): Workspace | null => {
    const matches = get().workspaces.filter((w) => w.path === '' || full === w.path || full.startsWith(w.path + '/'));
    return matches.sort((a, b) => b.path.length - a.path.length)[0] ?? null;
  };

  // the path each case was last written to — drives rename-on-write cleanup
  const lastCasePath = new Map<string, string>();
  const seedPaths = () => {
    lastCasePath.clear();
    get().cases.forEach((c) => lastCasePath.set(c.id, casePath(c)));
  };

  // recompute git-derived dirty state shortly after writes settle
  const scheduleRefresh = () => schedulePersist('git:status', () => get().refreshStatus(), 250);
  const reseed = () => {
    seedPaths();
    scheduleRefresh();
  };

  const reloadFromDisk = async () => {
    const { repoPath, workspaces } = get();
    if (!repoPath || !workspaces.length) return;
    try {
      const loaded = await loadRepo(repoPath, workspaces);
      set({ tree: loaded.tree, cases: loaded.cases, runs: loaded.runs, warnings: loaded.warnings });
      seedPaths();
    } catch {
      /* keep optimistic state if even the reload fails */
    }
  };

  const onWriteError = (e: unknown) => {
    set({ error: e instanceof Error ? e.message : String(e) });
    get().toast('Write failed — reloading from disk');
    void reloadFromDisk();
  };

  const writeCaseNow = async (id: string) => {
    const { repoPath } = get();
    const c = get().cases.find((x) => x.id === id);
    if (!repoPath || !c) return;
    const rel = casePath(c);
    const { suite: _s, modified: _m, ...parsed } = c;
    try {
      await writeFileAt(repoPath, rel, serializeCase(parsed));
      const prev = lastCasePath.get(id);
      if (prev && prev !== rel) await deletePath(repoPath, prev);
      lastCasePath.set(id, rel);
      scheduleRefresh();
    } catch (e) {
      onWriteError(e);
    }
  };

  const deleteCaseOnDisk = async (rel: string, id: string) => {
    const { repoPath } = get();
    if (!repoPath) return;
    try {
      await deletePath(repoPath, rel);
      lastCasePath.delete(id);
      scheduleRefresh();
    } catch (e) {
      onWriteError(e);
    }
  };

  const writeRunNow = async (runId: string) => {
    const { repoPath } = get();
    const run = get().runs.find((r) => r.id === runId);
    if (!repoPath || !run) return;
    try {
      await writeFileAt(repoPath, runRel(run), serializeRunCsv(run.rows));
      scheduleRefresh();
    } catch (e) {
      onWriteError(e);
    }
  };

  const writeWsYaml = async (wsId: string) => {
    const rp = get().repoPath;
    const ws = get().workspaces.find((w) => w.id === wsId);
    if (!rp || !ws) return;
    try {
      await writeFileAt(rp, `${ws.path}/workspace.yaml`, serializeWorkspaceYaml(ws));
      scheduleRefresh();
    } catch (e) {
      onWriteError(e);
    }
  };

  // upsert a change by its kind:refId key, preserving list order
  const upsertChange = (change: Change) =>
    set((s) => {
      const k = changeKey(change);
      return s.changes.some((c) => changeKey(c) === k)
        ? { changes: s.changes.map((c) => (changeKey(c) === k ? { ...c, ...change } : c)) }
        : { changes: [...s.changes, change] };
    });

  const applyMerge = (resolutions: Resolutions) => {
    const conflict = get().conflict;
    if (!conflict) return;
    conflict.files.forEach((file) => {
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
        set((s) => ({ cases: s.cases.map((c) => (c.id === file.caseId ? { ...c, ...apply } : c)) }));
      } else {
        set((s) => ({
          runs: s.runs.map((run) => {
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
                  const val = r.choice === 'ours' ? rr.ours : rr.theirs;
                  return val ? { ...row, ...val } : row;
                }
                if (rr.auto === 'theirs' && rr.value) return { ...row, ...rr.value };
                return row;
              }),
            };
          }),
        }));
      }
    });
  };

  return {
    /* ---- initial state ---- */
    cases: [],
    tree: [],
    runs: [],
    workspace: null,
    workspaces: [],
    repoPath: '',
    loading: false,
    error: null,
    warnings: [],
    recents: [],
    conflict: null,
    screen: 'launcher',
    view: 'editor',
    sel: { kind: 'case', id: undefined, runId: null },
    changes: [],
    gitBusy: false,
    mergeBanner: null,
    ahead: 0,
    behind: 0,
    branch: 'main',
    lastTester: '',
    modal: null,
    toasts: [],
    collapsed: {},
    renaming: null,

    /* ---- derived helpers ---- */
    casePath,
    casesInSuite: (suiteId) => buildSuiteIndex(get().tree).inSuite(suiteId),
    toast: (msg) => {
      const id = Math.random();
      set((s) => ({ toasts: [...s.toasts, { id, msg }] }));
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2600);
    },

    /* ---- repo ---- */
    loadRecents: async () => {
      set({ recents: await listRecents() });
    },

    openRepo: async (path) => {
      const target = path ?? (await pickDirectory());
      if (!target) return;
      set({ loading: true, error: null });
      try {
        const opened = await openRepoSvc(target);
        const loaded = await loadRepo(opened.repoPath, opened.workspaces);
        // active workspace = the one holding the initially-selected case (else the first)
        const firstCase = loaded.cases[0];
        const firstCasePath = firstCase ? buildSuiteIndex(loaded.tree).path[firstCase.suite] ?? '' : '';
        const ws =
          opened.workspaces.find((w) => firstCasePath === w.path || firstCasePath.startsWith(w.path + '/')) ??
          opened.workspaces[0] ??
          null;
        set({
          repoPath: opened.repoPath,
          workspaces: opened.workspaces,
          workspace: ws,
          branch: opened.branch,
          tree: loaded.tree,
          cases: loaded.cases,
          runs: loaded.runs,
          warnings: [...opened.warnings, ...loaded.warnings],
          changes: [],
          conflict: null,
          ahead: 0,
          behind: 0,
          screen: 'main',
          view: 'editor',
          sel: { kind: 'case', id: loaded.cases[0]?.id, runId: null },
          loading: false,
          error: null,
        });
        seedPaths();
        void get().refreshStatus();
        const recents = await addRecent({
          path: opened.repoPath,
          name: baseName(opened.repoPath),
          branch: opened.branch,
          remote: '',
          lastOpened: new Date().toISOString(),
          workspaces: opened.workspaces.length,
          lastWorkspaceId: ws?.id ?? null,
        });
        set({ recents });
      } catch (e) {
        set({ loading: false, error: e instanceof Error ? e.message : String(e) });
        get().toast('Could not open repository');
      }
    },

    goHome: () => {
      void flushPersist();
      set({ screen: 'launcher' });
    },

    // all workspaces are loaded eagerly; this just sets the active context for new items
    setWorkspace: async (w) => {
      set({ workspace: w });
    },

    updateWorkspace: (wsId, patch) => {
      const ws = get().workspaces.find((w) => w.id === wsId);
      if (!ws) return;
      const next: Workspace = { ...ws, ...patch };
      set((s) => {
        let tree = s.tree;
        if (patch.name !== undefined) {
          tree = clone(s.tree);
          const n = findSuiteNode(tree, wsId);
          if (n) n.name = next.name;
        }
        return {
          workspaces: s.workspaces.map((w) => (w.id === wsId ? next : w)),
          workspace: s.workspace?.id === wsId ? next : s.workspace,
          tree,
        };
      });
      schedulePersist('ws:' + wsId, () => writeWsYaml(wsId));
      const rp = get().repoPath;
      if (rp && patch.runsDir !== undefined && next.runsDir.trim() !== '' && next.runsDir !== ws.runsDir) {
        void (async () => {
          await renamePath(rp, `${ws.path}/${ws.runsDir}`, `${ws.path}/${next.runsDir}`).catch(() => {});
          await reloadFromDisk();
          scheduleRefresh();
        })();
      }
    },
    openCase: (id) => {
      void flushPersist();
      const c = get().cases.find((x) => x.id === id);
      const ws = c ? workspaceOfPath(buildSuiteIndex(get().tree).path[c.suite] ?? '') : null;
      set((s) => ({ sel: { ...s.sel, kind: 'case', id }, view: 'editor', workspace: ws ?? s.workspace }));
    },
    openSuite: (suiteId) => {
      void flushPersist();
      const node = findSuiteNode(get().tree, suiteId);
      const ws = node ? workspaceOfPath(node.path) : null;
      set((s) => ({ sel: { ...s.sel, kind: 'suite', suiteId }, view: 'suite', workspace: ws ?? s.workspace }));
    },
    openRunsList: () => {
      void flushPersist();
      set({ view: 'runs' });
    },
    openRun: (runId) => {
      void flushPersist();
      set((s) => ({ sel: { ...s.sel, kind: 'run', runId }, view: 'run' }));
    },
    openCreateRun: () => set({ modal: 'createRun' }),
    startGuide: (runId, index = 0) => {
      void flushPersist();
      set((s) => ({ sel: { ...s.sel, kind: 'run', runId, guideIndex: index }, view: 'guide' }));
    },
    guideGo: (index) => set((s) => ({ sel: { ...s.sel, guideIndex: index } })),
    exitGuide: () => set({ view: 'run' }),

    /* ---- case mutations ---- */
    updateCase: (id, patch) => {
      const c = get().cases.find((x) => x.id === id);
      set((s) => ({ cases: s.cases.map((x) => (x.id === id ? { ...x, ...patch, modified: true } : x)) }));
      if (c) {
        const merged = { ...c, ...patch };
        const existing = get().changes.find((ch) => ch.kind === 'case' && ch.refId === id);
        upsertChange({
          kind: 'case',
          refId: id,
          path: casePath(merged),
          status: existing?.status === 'A' ? 'A' : 'M',
          label: merged.title,
        });
      }
      schedulePersist('case:' + id, () => writeCaseNow(id));
    },

    duplicateCase: (id) => {
      const src = get().cases.find((c) => c.id === id);
      if (!src) return;
      const newId = randomId();
      // a duplicate intentionally inherits the source displayId — the editor surfaces the
      // resulting ID conflict and lets the user decide how to renumber it.
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
      set((s) => ({ cases: [...s.cases, dup], sel: { kind: 'case', id: newId, runId: null }, view: 'editor' }));
      upsertChange({ kind: 'case', refId: newId, path: casePath(dup), status: 'A', label: dup.title });
      void writeCaseNow(newId);
      get().toast('Duplicated — resolve the display ID conflict');
    },

    deleteCase: (id) => {
      const { cases, runs } = get();
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
      const rel = lastCasePath.get(id) ?? casePath(c);
      const rest = cases.filter((x) => x.id !== id);
      set({ cases: rest, sel: { kind: 'case', id: rest[0]?.id, runId: null }, view: 'editor' });
      upsertChange({ kind: 'case', refId: id, path: casePath(c), status: 'D', label: c.title });
      void deleteCaseOnDisk(rel, id);
      get().toast('Deleted ' + c.displayId);
    },

    createCase: (parentSuiteId) => {
      const { cases, tree, workspace } = get();
      const idx = buildSuiteIndex(tree);
      // default target: the active workspace's root folder (cases always live in a workspace)
      const suite = parentSuiteId ?? (workspace ? slug(workspace.path) : tree.find((n) => n.type === 'suite')?.id);
      if (!suite) return;
      const ws = workspaceOfPath(idx.path[suite] ?? '') ?? workspace;
      if (!ws) return;
      const newId = randomId();
      const prefix = ws.prefix || 'CW';
      const num =
        Math.max(
          0,
          ...cases
            .filter((c) => c.displayId.startsWith(prefix + '-'))
            .map((c) => parseInt(c.displayId.split('-')[1] ?? '0', 10) || 0),
        ) + 1;
      const displayId = `${prefix}-${String(num).padStart(4, '0')}`;
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
      set((s) => {
        const nextTree = clone(s.tree);
        findSuiteNode(nextTree, suite)?.children.push({ type: 'case', id: newId });
        return {
          cases: [...s.cases, kase],
          tree: nextTree,
          collapsed: { ...s.collapsed, [suite]: false },
          sel: { kind: 'case', id: newId, runId: null },
          view: 'editor',
          workspace: ws,
        };
      });
      upsertChange({ kind: 'case', refId: newId, path: casePath(kase), status: 'A', label: kase.title });
      void writeCaseNow(newId);
      get().toast('New case · ' + displayId);
    },

    createSuite: (parentId) => {
      const { tree, workspace } = get();
      const targetId = parentId ?? (workspace ? slug(workspace.path) : null);
      const parent = targetId ? findSuiteNode(tree, targetId) : null;
      if (!parent || !targetId) return; // suites live inside a workspace
      const id = 'suite-' + randomId(6);
      const name = 'New Suite';
      const path = parent.path + '/' + name;
      set((s) => {
        const nextTree = clone(s.tree);
        findSuiteNode(nextTree, targetId)?.children.push({ type: 'suite', id, name, path, children: [] });
        return {
          tree: nextTree,
          collapsed: { ...s.collapsed, [targetId]: false },
          renaming: { id, value: name },
        };
      });
      if (get().repoPath) void makeDir(get().repoPath, suiteRel(id)).then(scheduleRefresh).catch(onWriteError);
      get().toast(`New suite in ${parent.name}`);
    },

    renameSuite: (id, name) => {
      const oldRel = suiteRel(id);
      set((s) => {
        const next = clone(s.tree);
        const fix = (nodes: TreeNode[], parentPath: string) =>
          nodes.forEach((n) => {
            if (n.type === 'suite') {
              if (n.id === id) n.name = name;
              n.path = parentPath ? parentPath + '/' + n.name : n.name;
              fix(n.children, n.path);
            }
          });
        fix(next, '');
        return { tree: next };
      });
      const rp = get().repoPath;
      const newRel = suiteRel(id);
      if (rp && oldRel && newRel && oldRel !== newRel) {
        void renamePath(rp, oldRel, newRel).then(reseed).catch(onWriteError);
      }
    },

    deleteSuite: (id) => {
      const node = findSuiteNode(get().tree, id);
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
      const rel = suiteRel(id);
      set((s) => {
        const next = clone(s.tree);
        const prune = (nodes: TreeNode[]): boolean => {
          const i = nodes.findIndex((n) => n.id === id);
          if (i !== -1) {
            nodes.splice(i, 1);
            return true;
          }
          return nodes.some((n) => n.type === 'suite' && prune(n.children));
        };
        prune(next);
        return { tree: next, cases: s.cases.filter((c) => !caseIds.includes(c.id)) };
      });
      const rp = get().repoPath;
      if (rp && rel) void deletePath(rp, rel).then(reseed).catch(onWriteError);
      get().toast(`Deleted suite "${node.name}"`);
    },

    // moves a node and reassigns moved cases' suite — atomically, in one update
    moveNodeToParent: (dragId, parentId, index) => {
      if (dragId === parentId) return;
      if (findSuiteNode(get().tree, dragId)?.isWorkspace) return; // can't move a workspace folder
      if (parentId == null) return; // items must stay inside a workspace
      if (isDescendant(get().tree, dragId, parentId)) return;
      const draggedCase = get().cases.find((c) => c.id === dragId);
      const oldRel = draggedCase ? lastCasePath.get(dragId) ?? casePath(draggedCase) : suiteRel(dragId);
      set((s) => {
        const next = clone(s.tree);
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
        if (!dragged) return {};
        let arr: TreeNode[];
        if (parentId == null) arr = next;
        else {
          const p = findSuiteNode(next, parentId);
          if (!p) return {};
          arr = p.children;
        }
        arr.splice(Math.max(0, Math.min(index, arr.length)), 0, dragged);
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
        const cases = s.cases.map((c) =>
          movedCaseParent[c.id] && movedCaseParent[c.id] !== c.suite
            ? { ...c, suite: movedCaseParent[c.id] as string, modified: true }
            : c,
        );
        return { tree: next, cases };
      });
      const movedCase = get().cases.find((c) => c.id === dragId);
      const newRel = movedCase ? casePath(movedCase) : suiteRel(dragId);
      const rp = get().repoPath;
      if (rp && oldRel && newRel && oldRel !== newRel) {
        void renamePath(rp, oldRel, newRel).then(reseed).catch(onWriteError);
      }
    },

    /* ---- runs ---- */
    updateRunRow: (runId, i, patch) => {
      const run = get().runs.find((r) => r.id === runId);
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id !== runId ? r : { ...r, rows: r.rows.map((row, j) => (j === i ? { ...row, ...patch } : row)) },
        ),
      }));
      if (run) upsertChange({ kind: 'run', refId: runId, path: run.file, status: 'M', label: run.name });
      schedulePersist('run:' + runId, () => writeRunNow(runId));
    },

    createRun: ({ name, scope, tag, suite }) => {
      const { cases, workspace, tree } = get();
      if (!workspace) return;
      const idx = buildSuiteIndex(tree);
      const inWs = (c: Case) => {
        const p = idx.path[c.suite] ?? '';
        return workspace.path === '' || p === workspace.path || p.startsWith(workspace.path + '/');
      };
      const ids =
        scope === 'tag'
          ? cases.filter((c) => inWs(c) && c.tags.includes(tag)).map((c) => c.id)
          : scope === 'suite'
            ? idx.inSuite(suite)
            : cases.filter(inWs).map((c) => c.id);
      const rows: RunRow[] = ids.map((id) => {
        const c = cases.find((x) => x.id === id)!;
        return { case_id: id, display_id: c.displayId, title: c.title, result: 'not_run', tester: '', executed_at: '', notes: '' };
      });
      const date = new Date().toISOString().slice(0, 10);
      const stem = runFileStem(name, date);
      const file = relJoin(workspace.path, workspace.runsDir, `${stem}.csv`); // full repo-relative
      const run: Run = { id: file.replace(/\.csv$/, ''), name, file, created: date, status: 'open', scope, rows };
      set((s) => ({ runs: [run, ...s.runs], modal: null, sel: { ...s.sel, kind: 'run', runId: run.id, guideIndex: 0 }, view: 'guide' }));
      upsertChange({ kind: 'run', refId: run.id, path: run.file, status: 'A', label: run.name });
      const rp = get().repoPath;
      if (rp) {
        void Promise.all([
          writeFileAt(rp, run.file, serializeRunCsv(run.rows)),
          writeFileAt(rp, run.file.replace(/\.csv$/, '.md'), serializeRunSidecar({ name, status: 'open' })),
        ])
          .then(scheduleRefresh)
          .catch(onWriteError);
      }
      get().toast(`Created run · ${rows.length} cases seeded`);
    },

    setLastTester: (v) => set({ lastTester: v }),

    /* ---- tree ui state setters (accept value or updater, like useState) ---- */
    setCollapsed: (updater) =>
      set((s) => ({
        collapsed:
          typeof updater === 'function'
            ? (updater as (p: Record<string, boolean>) => Record<string, boolean>)(s.collapsed)
            : updater,
      })),
    setRenaming: (updater) =>
      set((s) => ({
        renaming: typeof updater === 'function' ? (updater as (p: Renaming | null) => Renaming | null)(s.renaming) : updater,
      })),

    /* ---- git ---- */
    refreshStatus: async () => {
      const { repoPath } = get();
      if (!repoPath) return;
      try {
        const s = await gitStatus(repoPath);
        set({ branch: s.branch, ahead: s.ahead, behind: s.behind, changes: s.changes });
      } catch {
        /* status read failed — keep optimistic values */
      }
    },

    doCommit: (selectedKeys, msg) => {
      const { repoPath, changes } = get();
      const paths = changes.filter((c) => selectedKeys.includes(changeKey(c))).map((c) => c.path);
      set({ modal: null, gitBusy: true });
      void (async () => {
        try {
          await flushPersist();
          if (repoPath) await stageAndCommit(repoPath, paths, msg || 'Update test cases');
          set((s) => ({
            cases: s.cases.map((c) => (selectedKeys.includes('case:' + c.id) ? { ...c, modified: false } : c)),
          }));
          await get().refreshStatus();
          get().toast(`Committed ${paths.length || selectedKeys.length} file(s)`);
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
          get().toast('Commit failed');
        } finally {
          set({ gitBusy: false });
        }
      })();
    },

    doPush: async () => {
      const { repoPath, ahead } = get();
      if (!repoPath || !ahead) return;
      set({ gitBusy: true });
      try {
        await gitPush(repoPath);
        await get().refreshStatus();
        get().toast(`Pushed to origin/${get().branch}`);
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
        get().toast(e instanceof GitAuthError ? 'Push failed — check Git credentials' : 'Push failed');
      } finally {
        set({ gitBusy: false });
      }
    },

    doPull: async () => {
      const { repoPath } = get();
      if (!repoPath) return;
      set({ gitBusy: true, mergeBanner: null });
      try {
        await flushPersist();
        const res = await gitPull(repoPath);
        if (res.ok) {
          await reloadFromDisk();
          await get().refreshStatus();
          get().toast('Pulled — up to date');
        } else {
          set({
            mergeBanner: `Pull produced conflicts in ${res.conflicted.length} file(s) — the structured resolver is coming soon; resolve via Git or abort the merge.`,
          });
          await get().refreshStatus();
        }
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
        get().toast(e instanceof GitAuthError ? 'Pull failed — check Git credentials' : 'Pull failed');
      } finally {
        set({ gitBusy: false });
      }
    },

    abortMerge: async () => {
      const { repoPath } = get();
      if (!repoPath) return;
      set({ gitBusy: true });
      try {
        await gitAbortMerge(repoPath);
        await reloadFromDisk();
        await get().refreshStatus();
        set({ mergeBanner: null });
        get().toast('Merge aborted');
      } catch {
        get().toast('Could not abort merge');
      } finally {
        set({ gitBusy: false });
      }
    },

    completeMerge: (resolutions) => {
      applyMerge(resolutions);
      set({ modal: null, conflict: null });
      void get().refreshStatus();
      get().toast('Merge resolved');
    },

    /* ---- modals ---- */
    setModal: (modal) => set({ modal }),
  };
});

/**
 * Read the whole store (re-renders on any change — matches the previous context
 * behavior). For finer-grained subscriptions, use `useAppStore(selector)` directly.
 */
export const useApp = (): AppState => useAppStore();
