import type { Dispatch, SetStateAction } from 'react';
import { create } from 'zustand';

import { serializeCase } from '@/services/format/case';
import { caseFileName, runCaseFileName, runFileStem } from '@/services/format/filename';
import { serializeRunCase, serializeRunDetails, type RunCaseFile, type RunCaseItem } from '@/services/format/run';
import {
  deletePath,
  derivePrefix,
  ensureWikiSafeFolder,
  folderNoteRel,
  initRepo as initRepoSvc,
  loadRepo,
  makeDir,
  moveFolderNote,
  openRepo as openRepoSvc,
  relJoin,
  renamePath,
  syncFolderNote,
  toRepoRelative,
  wasSelfWrite,
  writeFileAt,
  writeWorkspacesList,
} from '@/services/repo';
import { addRecent, listRecents } from '@/services/recents';
import { flushPersist, schedulePersist } from '@/services/persist';
import { watchRepo, type RepoWatcher } from '@/services/watch';
import {
  abortMerge as gitAbortMerge,
  GitAuthError,
  pull as gitPull,
  push as gitPush,
  stageAndCommit,
  status as gitStatus,
} from '@/services/git';
import type { LintWarning } from '@/schemas';
import { folderSlug, nowStamp, randomId, slug } from '@/utils/ids';
import { buildRunSummary, deriveItems, serializeRunSummary } from '@/utils/run-items';
import { isNwjs, openExternal, pickDirectory } from '@/lib/nwjs';
import { groupRunBySuite } from '@/services/report/suite-grouping';
import { exportRunReport } from '@/services/report/run-report';
import type { RunReportModel } from '@/services/report/run-report-html';
import { downloadInstaller, fetchLatestUpdate, isInstalledBuild, runInstallerAndQuit } from '@/services/updater';
import type {
  Approval,
  Case,
  Change,
  CheckState,
  Conflict,
  CreateRunArgs,
  DialogRequest,
  ModalKind,
  Recent,
  Renaming,
  Resolutions,
  Result,
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
  // Display-ID prefix resolved by inheritance: a suite uses its own prefix, else the
  // nearest ancestor's, else 'CW'. Workspace roots carry their prefix, so this is uniform.
  const resolvedPrefix: Record<string, string> = {};
  const walk = (nodes: TreeNode[], inherited: string) =>
    nodes.forEach((n) => {
      if (n.type === 'suite') {
        path[n.id] = n.path;
        const eff = (n.prefix && n.prefix.trim()) || inherited;
        resolvedPrefix[n.id] = eff || 'CW';
        walk(n.children, eff);
      }
    });
  walk(tree, '');

  const collect = (nodes: TreeNode[], acc: string[]) =>
    nodes.forEach((n) => (n.type === 'case' ? acc.push(n.id) : collect(n.children, acc)));

  const inSuite = (suiteId: string): string[] => {
    const node = findSuiteNode(tree, suiteId);
    const acc: string[] = [];
    if (node) collect(node.children, acc);
    return acc;
  };

  return { path, resolvedPrefix, inSuite };
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
  /** Opened a Git repo that has no `.casewright/` yet — offer to scaffold it. */
  needsInit: boolean;
  /** Opened a `.casewright/` repo with zero workspaces — invite creating the first. */
  emptyRepo: boolean;
  initRepo: () => Promise<void>;

  /* navigation / selection */
  screen: Screen;
  view: View;
  sel: Selection;
  openRepo: (path?: string) => Promise<void>;
  goHome: () => void;
  setWorkspace: (w: Workspace) => Promise<void>;
  updateWorkspace: (wsId: string, patch: Partial<Workspace>) => void;
  /** Edit a suite's metadata (display name / prefix override / description) in its folder note. */
  updateSuite: (suiteId: string, patch: { name?: string; prefix?: string; description?: string }) => void;
  /** The display-ID prefix a suite resolves to (own override → nearest ancestor → 'CW'). */
  resolveSuitePrefix: (suiteId: string) => string;
  /** Pick a folder, declare it a workspace (in config.yaml + its folder note), then open the edit modal. */
  addWorkspace: () => Promise<void>;
  /** Open the workspace edit modal, pre-selecting the active workspace. */
  editWorkspace: () => void;
  /** Confirm, then drop the active workspace from config.yaml (leaving its files untouched). */
  removeWorkspace: () => Promise<void>;
  /** Workspace pre-selected in the edit modal's dropdown (set by add/edit). */
  wsModalId: string | null;
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
  /** Undo / redo the case content-edit history (Ctrl+Z / Ctrl+Y), navigating to the changed case + field. */
  undo: () => void;
  redo: () => void;
  /** A pulse asking the editor to scroll/focus a field after an undo/redo lands there (nonce retriggers). */
  editorFocus: { field: string; nonce: number } | null;
  duplicateCase: (id: string) => void;
  deleteCase: (id: string) => Promise<void>;
  createCase: (parentSuiteId: string | null) => void;
  createSuite: (parentId: string | null) => void;
  renameSuite: (id: string, name: string) => void;
  deleteSuite: (id: string) => Promise<void>;
  moveNodeToParent: (dragId: string, parentId: string | null, index: number) => void;

  /* runs */
  updateRunRow: (runId: string, i: number, patch: Partial<RunRow>) => void;
  createRun: (args: CreateRunArgs) => void;
  /** Cycle one checklist item: none → pass → fail → none (persisted to the case sidecar). */
  cycleRunCheck: (runId: string, i: number, key: string) => void;
  setRunFailNote: (runId: string, i: number, key: string, note: string) => void;
  setRunGroupChecks: (runId: string, i: number, keys: string[], state: CheckState) => void;
  recordRunResult: (runId: string, i: number, patch: { result: Result; tester: string; notes: string }) => void;
  /** Set the run's default test date (ISO) used to resolve `{{today}}` in the runner. */
  setRunTestDate: (runId: string, date: string) => void;
  /** Override one case's test date (ISO), or clear the override with `null` to inherit the run's. */
  setRowTestDate: (runId: string, i: number, date: string | null) => void;
  /** Rename a run (display name only; the run folder/id is unchanged). */
  setRunName: (runId: string, name: string) => void;
  setRunNotes: (runId: string, notes: string) => void;
  /** Save (name + now) or clear (empty name → null) a tester/reviewer approval. */
  setRunApproval: (runId: string, who: 'tester' | 'reviewer', name: string) => void;
  /** Duplicate a run: copy its cases into a fresh run with results/checks/approvals reset. */
  duplicateRun: (runId: string) => void;
  /** Delete a run — removes its whole folder from disk, after confirming. */
  deleteRun: (runId: string) => Promise<void>;
  /** Render a single run to a PDF report the user picks a destination for (NW.js only). */
  exportRunToPdf: (runId: string) => Promise<void>;
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
  /** The workspace owning a case (derived from its suite path) — for repo-level run bucketing. */
  caseWorkspace: (caseId: string) => Workspace | null;
  toast: (msg: string) => void;
  toasts: Toast[];

  /* generic dialogs (shadcn) — replace native window.confirm/alert */
  dialog: DialogRequest | null;
  /** Ask the user to confirm; resolves true if they accept, false if they cancel/dismiss. */
  confirm: (opts: Omit<DialogRequest, 'kind'>) => Promise<boolean>;
  /** Show a message with a single acknowledge button; resolves when dismissed. */
  alert: (opts: { title: string; message?: string; okLabel?: string }) => Promise<void>;
  /** Resolve the open dialog (true = primary action). Called by the dialog host. */
  closeDialog: (result: boolean) => void;

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

  /* updates (GitHub release auto-update; Windows/NW.js only) */
  updateStatus: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'unsupported' | 'error';
  /** Newer version available (tag without `v`), or null. */
  updateVersion: string | null;
  /** Background-download progress, 0..100. */
  updateProgress: number;
  /** The release page URL, shown to portable builds that can't self-apply. */
  updateReleaseUrl: string | null;
  /** Poll GitHub for a newer release; auto-downloads the installer for installed builds. */
  checkForUpdate: () => Promise<void>;
  /** Launch the downloaded installer and quit so it can replace + relaunch the app. */
  relaunchToUpdate: () => void;
  /** Open the release page in the browser (portable / unsupported builds). */
  openReleasePage: () => void;

  /* modals */
  modal: ModalKind;
  setModal: (modal: ModalKind) => void;
}

/** Repo-level runs live flat under `.casewright/runs/` (PRD §4 req 16). */
const RUNS_REL = '.casewright/runs';

const changeKey = (c: Change) => c.kind + ':' + c.refId;

export const useAppStore = create<AppState>()((set, get) => {
  // Resolver for the currently-open generic dialog (confirm/alert). Only one dialog shows
  // at a time; a new request cancels any pending one (resolves it false).
  let pendingDialog: ((result: boolean) => void) | null = null;

  // Path of the installer downloaded by `checkForUpdate`, handed to `relaunchToUpdate`.
  let downloadedInstaller: string | null = null;

  // suite paths in the tree are full repo-relative (workspaces are top-level folders)
  const casePath = (c: Case): string => {
    const dir = buildSuiteIndex(get().tree).path[c.suite] ?? '';
    return dir ? `${dir}/${caseFileName(c)}` : caseFileName(c);
  };

  /* ---- disk persistence (optimistic in-memory + write; reload on error) ---- */
  const suiteRel = (suiteId: string): string => buildSuiteIndex(get().tree).path[suiteId] ?? '';

  /** The workspace owning a given repo-relative path (longest matching prefix). The
   *  repo-root workspace (`path === ''`) owns everything; a more specific workspace wins. */
  const workspaceOfPath = (full: string): Workspace | null => {
    const matches = get().workspaces.filter((w) => w.path === '' || full === w.path || full.startsWith(w.path + '/'));
    return matches.sort((a, b) => b.path.length - a.path.length)[0] ?? null;
  };

  /** Derive a case's owning workspace from its suite path (PRD §4 req 18). */
  const caseWorkspace = (caseId: string): Workspace | null => {
    const c = get().cases.find((x) => x.id === caseId);
    if (!c) return null;
    return workspaceOfPath(buildSuiteIndex(get().tree).path[c.suite] ?? '');
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

  /** Re-discover workspaces + rebuild the tree after we add/remove a `casewright.yaml`
   *  ourselves. Preserves the active workspace + case selection when they survive. */
  const refreshWorkspaces = async () => {
    const repoPath = get().repoPath;
    if (!repoPath) return;
    await flushPersist();
    const opened = await openRepoSvc(repoPath);
    const loaded = await loadRepo(repoPath, opened.workspaces);
    set((s) => {
      const ws = opened.workspaces.find((w) => w.id === s.workspace?.id) ?? opened.workspaces[0] ?? null;
      const empty = opened.workspaces.length === 0;
      const keepSel = s.sel.kind === 'case' && !!s.sel.id && loaded.cases.some((c) => c.id === s.sel.id);
      return {
        workspaces: opened.workspaces,
        workspace: ws,
        branch: opened.branch,
        tree: loaded.tree,
        cases: loaded.cases,
        runs: loaded.runs,
        warnings: [...opened.warnings, ...loaded.warnings],
        emptyRepo: empty,
        screen: empty ? 'launcher' : 'main',
        sel: keepSel ? s.sel : { ...s.sel, id: loaded.cases[0]?.id },
      };
    });
    seedPaths();
    void get().refreshStatus();
  };

  /* ---- external-change watcher: live-reload when files change outside the app ---- */
  let repoWatcher: RepoWatcher | null = null;
  let reloadingExternal = false;
  let queuedReload = false;

  const stopWatch = () => {
    repoWatcher?.close();
    repoWatcher = null;
  };

  // Re-run discovery + load so externally added/removed workspaces, suites, cases and
  // runs all appear; preserve the active workspace + selection when they still exist.
  const reloadAfterExternalChange = async () => {
    const repoPath = get().repoPath;
    if (!repoPath) return;
    await flushPersist(); // land any pending in-app edits first (ours win on a same-file clash)
    const opened = await openRepoSvc(repoPath);
    if (opened.needsInit) {
      stopWatch();
      set({
        needsInit: true,
        emptyRepo: false,
        screen: 'launcher',
        workspace: null,
        workspaces: [],
        tree: [],
        cases: [],
        runs: [],
        warnings: opened.warnings,
      });
      return;
    }
    const loaded = await loadRepo(repoPath, opened.workspaces);
    set((s) => {
      const ws = opened.workspaces.find((w) => w.id === s.workspace?.id) ?? opened.workspaces[0] ?? null;
      const keepSel = s.sel.kind === 'case' && !!s.sel.id && loaded.cases.some((c) => c.id === s.sel.id);
      return {
        workspaces: opened.workspaces,
        workspace: ws,
        branch: opened.branch,
        tree: loaded.tree,
        cases: loaded.cases,
        runs: loaded.runs,
        warnings: [...opened.warnings, ...loaded.warnings],
        emptyRepo: opened.workspaces.length === 0,
        sel: keepSel ? s.sel : { ...s.sel, id: loaded.cases[0]?.id },
      };
    });
    seedPaths();
    void get().refreshStatus();
    get().toast('Reloaded — external changes detected');
  };

  // Serialize reloads; if changes land mid-reload, run once more after (don't drop them).
  const handleExternalChange = async () => {
    if (reloadingExternal) {
      queuedReload = true;
      return;
    }
    reloadingExternal = true;
    try {
      do {
        queuedReload = false;
        try {
          await reloadAfterExternalChange();
        } catch {
          /* transient (a file mid-write by the external tool) — a later event retries */
        }
      } while (queuedReload);
    } finally {
      reloadingExternal = false;
    }
  };

  const startWatch = (repoPath: string) => {
    stopWatch();
    if (!repoPath || !isNwjs()) return; // watching needs the NW.js/Node runtime
    repoWatcher = watchRepo(repoPath, () => void handleExternalChange(), { isSelfWrite: wasSelfWrite });
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

  /* ---- undo / redo history (case content edits) ---- */
  type HistoryEntry = { caseId: string; field: string; snapshot: Case };
  const undoStack: HistoryEntry[] = [];
  const redoStack: HistoryEntry[] = [];
  const HISTORY_LIMIT = 200;
  const COALESCE_MS = 700;
  let coalesceKey: string | null = null;
  let coalesceAt = 0;

  const primaryField = (patch: Partial<Case>): string => Object.keys(patch).find((k) => k !== 'modified') ?? 'title';

  /** Snapshot a case's pre-edit state for undo, coalescing a rapid run of edits to the same field. */
  const recordEdit = (id: string, field: string) => {
    const c = get().cases.find((x) => x.id === id);
    if (!c) return;
    const now = Date.now();
    const key = `${id}:${field}`;
    const top = undoStack[undoStack.length - 1];
    const coalesce =
      !!top && top.caseId === id && top.field === field && key === coalesceKey && now - coalesceAt < COALESCE_MS;
    coalesceKey = key;
    coalesceAt = now;
    if (coalesce) return; // same burst → the existing entry already snapshots the pre-burst state
    undoStack.push({ caseId: id, field, snapshot: { ...c } });
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack.length = 0; // a fresh edit forks history — drop the redo branch
  };

  /** Restore a snapshot (from undo/redo) without recording new history, and navigate to it. */
  const applyHistory = (entry: HistoryEntry) => {
    coalesceKey = null; // never coalesce across an undo/redo boundary
    set((s) => ({
      cases: s.cases.map((x) => (x.id === entry.caseId ? { ...entry.snapshot, modified: true } : x)),
      sel: { ...s.sel, kind: 'case', id: entry.caseId, runId: null },
      view: 'editor',
      editorFocus: { field: entry.field, nonce: (s.editorFocus?.nonce ?? 0) + 1 },
    }));
    const c = get().cases.find((x) => x.id === entry.caseId);
    if (c) upsertChange({ kind: 'case', refId: entry.caseId, path: casePath(c), status: 'M', label: c.title });
    schedulePersist('case:' + entry.caseId, () => writeCaseNow(entry.caseId));
  };

  /** Drop any history entries for a case (e.g. after it's deleted) so undo can't resurrect it. */
  const pruneHistory = (id: string) => {
    for (let i = undoStack.length - 1; i >= 0; i--) if (undoStack[i].caseId === id) undoStack.splice(i, 1);
    for (let i = redoStack.length - 1; i >= 0; i--) if (redoStack[i].caseId === id) redoStack.splice(i, 1);
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

  /**
   * Build a per-case sidecar from a run row. The row's `itemText` snapshot — captured
   * when the run was seeded — is authoritative, so editing a case after a run exists never
   * silently rewrites that run's recorded checklist (PRD: runs are immune to later case
   * edits). We only fall back to deriving from the live `kase` for a brand-new run whose
   * snapshot hasn't been populated yet.
   */
  const buildRunCaseFile = (row: RunRow, kase: Case | undefined): RunCaseFile => {
    const overlay = (key: string, text: string): RunCaseItem => ({
      key,
      text,
      state: row.checks[key] ?? 'none',
      failNote: row.failNotes[key] ?? '',
    });
    const snapshot = row.itemText ?? {};
    const hasSnapshot = Object.keys(snapshot).length > 0;
    const group = (prefix: string): RunCaseItem[] => {
      if (hasSnapshot) {
        return Object.keys(snapshot)
          .filter((k) => k.startsWith(`${prefix}:`))
          .sort((a, b) => Number(a.split(':')[1]) - Number(b.split(':')[1]))
          .map((k) => overlay(k, snapshot[k]));
      }
      if (!kase) return [];
      const d = deriveItems(kase);
      const arr = prefix === 'setup' ? d.setup : prefix === 'step' ? d.steps : d.accept;
      return arr.map((it) => overlay(it.key, it.text));
    };
    const setup = group('setup');
    const steps = group('step');
    const accept = group('accept');
    return {
      caseId: row.case_id,
      displayId: row.display_id,
      title: row.title,
      result: row.result,
      tester: row.tester,
      executedAt: row.executed_at,
      testDate: row.testDate ?? undefined,
      notes: row.notes,
      setup,
      steps,
      accept,
    };
  };

  /** Snapshot a case's current checklist item text, keyed by position — frozen into a new run. */
  const snapshotItemText = (caseId: string): Record<string, string> => {
    const kase = get().cases.find((c) => c.id === caseId);
    const text: Record<string, string> = {};
    if (!kase) return text;
    const { setup, steps, accept } = deriveItems(kase);
    [...setup, ...steps, ...accept].forEach((it) => (text[it.key] = it.text));
    return text;
  };

  const runDetailsOf = (run: Run) => ({
    name: run.name,
    status: run.status,
    created: run.created,
    testDate: run.testDate,
    scope: run.scope,
    testerApproval: run.testerApproval,
    reviewerApproval: run.reviewerApproval,
    // The Summary is generated from results, not user-authored — regenerated on every write so
    // the committed `_run.md` always reflects the run's actual pass/fail state.
    summary: serializeRunSummary(buildRunSummary(run, get().cases)),
    notes: run.notes,
  });

  const writeRunDetailsNow = async (runId: string) => {
    const { repoPath } = get();
    const run = get().runs.find((r) => r.id === runId);
    if (!repoPath || !run) return;
    try {
      await writeFileAt(repoPath, relJoin(run.file, '_run.md'), serializeRunDetails(runDetailsOf(run)));
      scheduleRefresh();
    } catch (e) {
      onWriteError(e);
    }
  };

  const writeRunCaseNow = async (runId: string, i: number) => {
    const { repoPath } = get();
    const run = get().runs.find((r) => r.id === runId);
    const row = run?.rows[i];
    if (!repoPath || !run || !row) return;
    const kase = get().cases.find((c) => c.id === row.case_id);
    try {
      await writeFileAt(repoPath, row.file, serializeRunCase(buildRunCaseFile(row, kase)));
      scheduleRefresh();
    } catch (e) {
      onWriteError(e);
    }
  };

  /** Fan-out write of a brand-new run folder: `_run.md` + every case sidecar. */
  const writeWholeRun = (run: Run) => {
    const rp = get().repoPath;
    if (!rp) return;
    void makeDir(rp, run.file)
      .then(() =>
        Promise.all([
          writeFileAt(rp, relJoin(run.file, '_run.md'), serializeRunDetails(runDetailsOf(run))),
          ...run.rows.map((row) =>
            writeFileAt(rp, row.file, serializeRunCase(buildRunCaseFile(row, get().cases.find((c) => c.id === row.case_id)))),
          ),
        ]),
      )
      .then(scheduleRefresh)
      .catch(onWriteError);
  };

  /** Persist one case sidecar (debounced) + flag the run as modified. Also refreshes the
   *  run-details sidecar, whose generated Summary depends on this row's result/failures. */
  const persistRunCase = (runId: string, i: number) => {
    const run = get().runs.find((r) => r.id === runId);
    if (run) upsertChange({ kind: 'run', refId: runId, path: run.file, status: 'M', label: run.name });
    schedulePersist(`runcase:${runId}:${i}`, () => writeRunCaseNow(runId, i));
    schedulePersist(`rundetails:${runId}`, () => writeRunDetailsNow(runId));
  };

  /** Persist the run-details sidecar (debounced) + flag the run as modified. */
  const persistRunDetails = (runId: string) => {
    const run = get().runs.find((r) => r.id === runId);
    if (run) upsertChange({ kind: 'run', refId: runId, path: run.file, status: 'M', label: run.name });
    schedulePersist(`rundetails:${runId}`, () => writeRunDetailsNow(runId));
  };

  /** Replace one row in a run, immutably. */
  const patchRow = (runId: string, i: number, patch: Partial<RunRow>) =>
    set((s) => ({
      runs: s.runs.map((r) => (r.id !== runId ? r : { ...r, rows: r.rows.map((row, j) => (j === i ? { ...row, ...patch } : row)) })),
    }));

  // Persist a workspace's metadata to its (lazy) sibling folder note — written only when
  // it carries a custom name / prefix / description, else removed. Root → config.yaml.
  const writeWorkspaceNote = async (wsId: string) => {
    const rp = get().repoPath;
    const ws = get().workspaces.find((w) => w.id === wsId);
    if (!rp || !ws) return;
    try {
      await syncFolderNote(rp, ws.path, { name: ws.name, prefix: ws.prefix, description: ws.description });
      scheduleRefresh();
    } catch (e) {
      onWriteError(e);
    }
  };

  // Persist a suite's metadata to its (lazy) sibling folder note (frontmatter only — the
  // folder is not moved; clearing every field removes the note).
  const writeSuiteNote = async (suiteId: string) => {
    const rp = get().repoPath;
    const n = findSuiteNode(get().tree, suiteId);
    const rel = suiteRel(suiteId);
    if (!rp || !n || n.type !== 'suite' || !rel) return;
    try {
      await syncFolderNote(rp, rel, { name: n.name, prefix: n.prefix, description: n.description });
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

  /** Collapse raw per-file git changes into user-facing entities: one row per test run (its whole
   *  folder, not its files) and one per test case, labelled by run name / case title rather than
   *  the raw path. A run's `path` is its folder, so committing it stages every file inside. */
  const groupChanges = (raw: Change[]): Change[] => {
    const { runs, cases } = get();
    const caseByPath = new Map<string, Case>();
    cases.forEach((c) => {
      caseByPath.set(casePath(c), c);
      const last = lastCasePath.get(c.id);
      if (last) caseByPath.set(last, c);
    });
    const runFolderOf = (p: string): string | null => {
      const known = runs.find((r) => p === r.file || p.startsWith(r.file + '/'));
      if (known) return known.file;
      const m = /^(.*\/runs\/[^/]+)(?:\/|$)/.exec(p);
      return m ? m[1] : null;
    };

    const out: Change[] = [];
    const idx = new Map<string, number>();
    for (const ch of raw) {
      const folder = ch.kind === 'run' ? runFolderOf(ch.path) : null;
      if (folder) {
        const at = idx.get(folder);
        if (at === undefined) {
          idx.set(folder, out.length);
          const run = runs.find((r) => r.file === folder);
          out.push({ kind: 'run', refId: folder, path: folder, status: ch.status, label: run?.name ?? folder.split('/').pop() ?? folder });
        } else if (out[at].status !== ch.status) {
          out[at] = { ...out[at], status: 'M' }; // mixed adds/mods/deletes in one run folder → modified
        }
      } else {
        const c = caseByPath.get(ch.path);
        out.push({ ...ch, kind: 'case', refId: c?.id ?? ch.refId, label: c?.title ?? ch.label });
      }
    }
    return out;
  };

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
    needsInit: false,
    emptyRepo: false,
    conflict: null,
    screen: 'launcher',
    view: 'editor',
    sel: { kind: 'case', id: undefined, runId: null },
    editorFocus: null,
    changes: [],
    gitBusy: false,
    mergeBanner: null,
    ahead: 0,
    behind: 0,
    branch: 'main',
    lastTester: '',
    modal: null,
    wsModalId: null,
    toasts: [],
    dialog: null,
    collapsed: {},
    renaming: null,
    updateStatus: 'idle',
    updateVersion: null,
    updateProgress: 0,
    updateReleaseUrl: null,

    /* ---- derived helpers ---- */
    casePath,
    casesInSuite: (suiteId) => buildSuiteIndex(get().tree).inSuite(suiteId),
    resolveSuitePrefix: (suiteId) => buildSuiteIndex(get().tree).resolvedPrefix[suiteId] ?? 'CW',
    caseWorkspace,
    toast: (msg) => {
      const id = Math.random();
      set((s) => ({ toasts: [...s.toasts, { id, msg }] }));
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2600);
    },

    /* ---- generic dialogs ---- */
    confirm: (opts) =>
      new Promise<boolean>((resolve) => {
        pendingDialog?.(false); // a fresh request supersedes any pending one
        pendingDialog = resolve;
        set({ dialog: { kind: 'confirm', ...opts } });
      }),
    alert: (opts) =>
      new Promise<void>((resolve) => {
        pendingDialog?.(false);
        pendingDialog = () => resolve();
        set({ dialog: { kind: 'alert', title: opts.title, message: opts.message, confirmLabel: opts.okLabel } });
      }),
    closeDialog: (result) => {
      const resolve = pendingDialog;
      pendingDialog = null;
      set({ dialog: null });
      resolve?.(result);
    },

    /* ---- repo ---- */
    loadRecents: async () => {
      set({ recents: await listRecents() });
    },

    openRepo: async (path) => {
      const target = path ?? (await pickDirectory());
      if (!target) return;
      set({ loading: true, error: null, needsInit: false, emptyRepo: false });
      try {
        const opened = await openRepoSvc(target);
        // No `.casewright/` yet — stay on the launcher and offer to scaffold it (req 2).
        // Clear any previously-open repo's slices so the launcher never reads stale data.
        if (opened.needsInit) {
          stopWatch();
          set({
            loading: false,
            repoPath: opened.repoPath,
            branch: opened.branch,
            needsInit: true,
            emptyRepo: false,
            warnings: opened.warnings,
            screen: 'launcher',
            workspaces: [],
            workspace: null,
            tree: [],
            cases: [],
            runs: [],
            changes: [],
            conflict: null,
            ahead: 0,
            behind: 0,
            sel: { kind: 'case', id: undefined, runId: null },
          });
          return;
        }
        const loaded = await loadRepo(opened.repoPath, opened.workspaces);
        // active workspace = the one holding the initially-selected case (else the first)
        const firstCase = loaded.cases[0];
        const firstCasePath = firstCase ? buildSuiteIndex(loaded.tree).path[firstCase.suite] ?? '' : '';
        const ws =
          opened.workspaces.find((w) => firstCasePath === w.path || firstCasePath.startsWith(w.path + '/')) ??
          opened.workspaces[0] ??
          null;
        const empty = opened.workspaces.length === 0; // `.casewright/` present but no markers (req 11)
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
          needsInit: false,
          emptyRepo: empty,
          screen: empty ? 'launcher' : 'main',
          view: 'editor',
          sel: { kind: 'case', id: loaded.cases[0]?.id, runId: null },
          loading: false,
          error: null,
        });
        seedPaths();
        void get().refreshStatus();
        startWatch(opened.repoPath); // live-reload on external file changes
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

    initRepo: async () => {
      const target = get().repoPath;
      if (!target) return;
      set({ loading: true, error: null });
      try {
        await initRepoSvc(target);
        set({ needsInit: false });
        await get().openRepo(target); // re-open the now-initialized repo
        get().toast('Initialized .casewright/');
      } catch (e) {
        set({ loading: false, error: e instanceof Error ? e.message : String(e) });
        get().toast('Could not initialize repository');
      }
    },

    goHome: () => {
      void flushPersist();
      stopWatch();
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
      schedulePersist('ws:' + wsId, () => writeWorkspaceNote(wsId));
    },

    updateSuite: (suiteId, patch) => {
      set((s) => {
        const tree = clone(s.tree);
        const n = findSuiteNode(tree, suiteId);
        if (n && n.type === 'suite') {
          if (patch.name !== undefined) n.name = patch.name;
          if (patch.prefix !== undefined) n.prefix = patch.prefix.trim() || undefined;
          if (patch.description !== undefined) n.description = patch.description.trim() || undefined;
        }
        return { tree };
      });
      schedulePersist('suite:' + suiteId, () => writeSuiteNote(suiteId));
    },

    addWorkspace: async () => {
      const { repoPath, workspaces } = get();
      if (!repoPath) return;
      const picked = await pickDirectory();
      if (!picked) return;
      const pickedRel = toRepoRelative(repoPath, picked);
      if (pickedRel == null) {
        get().toast('Pick a folder inside this repository');
        return;
      }
      // Already a workspace → just open it for editing.
      const existing = workspaces.find((w) => w.path === pickedRel);
      if (existing) {
        set({ modal: 'workspace', wsModalId: existing.id });
        return;
      }
      // Workspaces can't nest (one folder can't be inside another workspace).
      const within = (a: string, b: string) => b === '' || a === b || a.startsWith(b + '/');
      if (workspaces.some((w) => within(pickedRel, w.path) || within(w.path, pickedRel))) {
        get().toast('Workspaces cannot be nested inside one another');
        return;
      }
      let rel = pickedRel;
      try {
        // Hyphenate the folder if the picked name has spaces (wiki-safe), then declare it
        // in config.yaml and write its folder note (lazy — workspaces always carry a prefix).
        rel = await ensureWikiSafeFolder(repoPath, pickedRel);
        const name = baseName(rel) || baseName(repoPath);
        const ws: Workspace = { id: slug(rel) || 'workspace', name, path: rel, description: '', prefix: derivePrefix(name) };
        await writeWorkspacesList(repoPath, [...workspaces.map((w) => w.path), rel]);
        await syncFolderNote(repoPath, rel, { name: ws.name, prefix: ws.prefix, description: ws.description });
      } catch (e) {
        onWriteError(e);
        return;
      }
      await refreshWorkspaces();
      const added = get().workspaces.find((w) => w.path === rel);
      if (added) {
        set({ modal: 'workspace', wsModalId: added.id, workspace: added });
        get().toast(`Added workspace "${added.name}"`);
      }
    },

    editWorkspace: () => {
      const ws = get().workspace;
      if (!ws) return;
      set({ modal: 'workspace', wsModalId: ws.id });
    },

    removeWorkspace: async () => {
      const { repoPath, workspace, workspaces } = get();
      if (!repoPath || !workspace) return;
      if (
        !(await get().confirm({
          title: `Remove workspace "${workspace.name}"?`,
          message:
            'This only removes it from .casewright/config.yaml — the folder, its cases, and its folder note are left untouched.',
          confirmLabel: 'Remove',
          danger: true,
        }))
      )
        return;
      try {
        await writeWorkspacesList(
          repoPath,
          workspaces.filter((w) => w.id !== workspace.id).map((w) => w.path),
        );
      } catch (e) {
        onWriteError(e);
        return;
      }
      const name = workspace.name;
      await refreshWorkspaces();
      get().toast(`Removed workspace "${name}"`);
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
      recordEdit(id, primaryField(patch)); // snapshot the pre-edit state for undo (before we mutate)
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

    undo: () => {
      const entry = undoStack.pop();
      if (!entry) return;
      const cur = get().cases.find((x) => x.id === entry.caseId);
      if (cur) redoStack.push({ caseId: entry.caseId, field: entry.field, snapshot: { ...cur } });
      applyHistory(entry);
    },

    redo: () => {
      const entry = redoStack.pop();
      if (!entry) return;
      const cur = get().cases.find((x) => x.id === entry.caseId);
      if (cur) undoStack.push({ caseId: entry.caseId, field: entry.field, snapshot: { ...cur } });
      applyHistory(entry);
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
        setup: src.setup.map((x) => ({ ...x })),
        expected: [...src.expected],
        steps: src.steps.map((s) => ({ ...s })),
      };
      set((s) => {
        // Insert the duplicate's tree node right after the source so it shows in the sidebar
        // (the tree — not the `cases` array — drives what renders). Mirrors `createCase`.
        const nextTree = clone(s.tree);
        const parent = findSuiteNode(nextTree, dup.suite);
        if (parent) {
          const i = parent.children.findIndex((n) => n.type === 'case' && n.id === id);
          parent.children.splice(i < 0 ? parent.children.length : i + 1, 0, { type: 'case', id: newId });
        }
        return {
          cases: [...s.cases, dup],
          tree: nextTree,
          collapsed: { ...s.collapsed, [dup.suite]: false },
          sel: { kind: 'case', id: newId, runId: null },
          view: 'editor',
        };
      });
      upsertChange({ kind: 'case', refId: newId, path: casePath(dup), status: 'A', label: dup.title });
      void writeCaseNow(newId);
      get().toast('Duplicated — resolve the display ID conflict');
    },

    deleteCase: async (id) => {
      const { cases, runs } = get();
      const c = cases.find((x) => x.id === id);
      if (!c) return;
      const used = runs.some((r) => r.rows.some((row) => row.case_id === id));
      if (
        !(await get().confirm({
          title: `Delete "${c.title}"?`,
          message: used
            ? 'This case is referenced by a run — its snapshot rows are kept but will no longer resolve to a live file.'
            : undefined,
          confirmLabel: 'Delete',
          danger: true,
        }))
      )
        return;
      const rel = lastCasePath.get(id) ?? casePath(c);
      const rest = cases.filter((x) => x.id !== id);
      pruneHistory(id); // the case is gone — its undo/redo snapshots can't be restored
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
      // Prefix resolves by inheritance: this suite's own override → nearest ancestor → workspace.
      const prefix = idx.resolvedPrefix[suite] ?? (ws.prefix || 'CW');
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
        setup: [],
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
      const path = parent.path + '/' + folderSlug(name); // → "New-Suite" on disk
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

    // Sidebar inline rename — structural: sets the display name AND re-slugs the folder
    // (renames the dir, moves/writes the sibling note). A multi-word name becomes a
    // hyphenated folder + a note recording the custom display name.
    renameSuite: (id, name) => {
      const oldRel = suiteRel(id);
      const folder = folderSlug(name) || baseName(oldRel);
      set((s) => {
        const next = clone(s.tree);
        const fix = (nodes: TreeNode[], parentPath: string) =>
          nodes.forEach((n) => {
            if (n.type !== 'suite') return;
            if (n.id === id) n.name = name;
            if (!n.isWorkspace) {
              const base = n.id === id ? folder : baseName(n.path);
              n.path = parentPath ? parentPath + '/' + base : base;
            }
            fix(n.children, n.path);
          });
        fix(next, '');
        return { tree: next };
      });
      const rp = get().repoPath;
      const newRel = suiteRel(id);
      const renamed = findSuiteNode(get().tree, id);
      if (!rp || !renamed) return;
      void (async () => {
        try {
          if (oldRel && newRel && oldRel !== newRel) {
            await deletePath(rp, folderNoteRel(oldRel)); // remove the stale sibling note (no-op if absent)
            await renamePath(rp, oldRel, newRel);
          }
          await syncFolderNote(rp, newRel, { name: renamed.name, prefix: renamed.prefix, description: renamed.description });
          reseed();
        } catch (e) {
          onWriteError(e);
        }
      })();
    },

    deleteSuite: async (id) => {
      const node = findSuiteNode(get().tree, id);
      if (!node) return;
      const collectCases = (n: TreeNode, acc: string[]): string[] => {
        if (n.type === 'suite')
          n.children.forEach((ch) => (ch.type === 'case' ? acc.push(ch.id) : collectCases(ch, acc)));
        return acc;
      };
      const caseIds = collectCases(node, []);
      if (
        !(await get().confirm({
          title: `Delete suite "${node.name}"${caseIds.length ? ` and its ${caseIds.length} case(s)` : ''}?`,
          confirmLabel: 'Delete',
          danger: true,
        }))
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
      if (rp && rel) {
        void (async () => {
          try {
            await deletePath(rp, rel);
            await deletePath(rp, folderNoteRel(rel)); // remove the sibling note too (no-op if absent)
            reseed();
          } catch (e) {
            onWriteError(e);
          }
        })();
      }
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
              // Workspace folders are fixed roots — their `path` may be nested (e.g.
              // `areas/payments`) and they can never be dragged, so keep it verbatim.
              // Regular suites are re-rooted under their (possibly new) parent, keyed on
              // their real on-disk folder name (`baseName(path)`), not their display name
              // (a `_suite.md` name can differ from the folder), so moves stay inside the
              // workspace instead of collapsing to the repo root.
              if (!n.isWorkspace) {
                const folder = baseName(n.path);
                n.path = parentPath ? parentPath + '/' + folder : folder;
              }
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
        void (async () => {
          try {
            await renamePath(rp, oldRel, newRel);
            // A moved suite's folder basename is unchanged — only its parent dir — so its
            // sibling note follows it (no-op when the suite has no note).
            if (!movedCase) await moveFolderNote(rp, oldRel, newRel);
            reseed();
          } catch (e) {
            onWriteError(e);
          }
        })();
      }
    },

    /* ---- runs ---- */
    updateRunRow: (runId, i, patch) => {
      patchRow(runId, i, patch);
      persistRunCase(runId, i);
    },

    setRunTestDate: (runId, date) => {
      set((s) => ({ runs: s.runs.map((r) => (r.id === runId ? { ...r, testDate: date } : r)) }));
      persistRunDetails(runId);
    },

    setRowTestDate: (runId, i, date) => {
      patchRow(runId, i, { testDate: date });
      persistRunCase(runId, i);
    },

    createRun: ({ name, caseIds, scopeLabel }) => {
      const { cases } = get();
      const date = new Date().toISOString().slice(0, 10);
      const dir = relJoin(RUNS_REL, runFileStem(name, date));
      const rows: RunRow[] = caseIds.map((id, i) => {
        const c = cases.find((x) => x.id === id);
        const display_id = c?.displayId ?? id;
        const title = c?.title ?? '';
        return {
          case_id: id,
          display_id,
          title,
          result: 'not_run',
          tester: '',
          executed_at: '',
          notes: '',
          checks: {},
          failNotes: {},
          itemText: snapshotItemText(id),
          file: relJoin(dir, runCaseFileName(i, { display_id, title })),
        };
      });
      const run: Run = {
        id: dir,
        name,
        file: dir,
        created: date,
        testDate: date,
        status: 'open',
        scope: scopeLabel ?? '',
        rows,
        summary: '',
        notes: '',
        testerApproval: null,
        reviewerApproval: null,
      };
      set((s) => ({ runs: [run, ...s.runs], modal: null, sel: { ...s.sel, kind: 'run', runId: run.id, guideIndex: 0 }, view: 'run' }));
      upsertChange({ kind: 'run', refId: run.id, path: run.file, status: 'A', label: run.name });
      writeWholeRun(run);
      get().toast(`Created run · ${rows.length} cases seeded`);
    },

    cycleRunCheck: (runId, i, key) => {
      const row = get().runs.find((r) => r.id === runId)?.rows[i];
      if (!row) return;
      const cur = row.checks[key] ?? 'none';
      const next: CheckState = cur === 'none' ? 'pass' : cur === 'pass' ? 'fail' : 'none';
      const checks = { ...row.checks, [key]: next };
      const failNotes = { ...row.failNotes };
      if (next !== 'fail') delete failNotes[key]; // a note only belongs to a failed item
      patchRow(runId, i, { checks, failNotes });
      persistRunCase(runId, i);
    },

    setRunFailNote: (runId, i, key, note) => {
      const row = get().runs.find((r) => r.id === runId)?.rows[i];
      if (!row) return;
      patchRow(runId, i, { failNotes: { ...row.failNotes, [key]: note } });
      persistRunCase(runId, i);
    },

    setRunGroupChecks: (runId, i, keys, state) => {
      const row = get().runs.find((r) => r.id === runId)?.rows[i];
      if (!row) return;
      const checks = { ...row.checks };
      const failNotes = { ...row.failNotes };
      for (const k of keys) {
        checks[k] = state;
        if (state !== 'fail') delete failNotes[k];
      }
      patchRow(runId, i, { checks, failNotes });
      persistRunCase(runId, i);
    },

    recordRunResult: (runId, i, { result, tester, notes }) => {
      patchRow(runId, i, { result, tester, notes, executed_at: result === 'not_run' ? '' : nowStamp() });
      persistRunCase(runId, i);
    },

    setRunName: (runId, name) => {
      set((s) => ({ runs: s.runs.map((r) => (r.id === runId ? { ...r, name } : r)) }));
      persistRunDetails(runId);
    },

    setRunNotes: (runId, notes) => {
      set((s) => ({ runs: s.runs.map((r) => (r.id === runId ? { ...r, notes } : r)) }));
      persistRunDetails(runId);
    },

    setRunApproval: (runId, who, name) => {
      const approval: Approval | null = name.trim() ? { name: name.trim(), at: nowStamp() } : null;
      const field = who === 'tester' ? 'testerApproval' : 'reviewerApproval';
      const wasClosed = get().runs.find((r) => r.id === runId)?.status === 'closed';
      set((s) => ({
        runs: s.runs.map((r) => {
          if (r.id !== runId) return r;
          const next = { ...r, [field]: approval };
          // A run closes once both tester and reviewer have signed off; clearing either reopens it.
          next.status = next.testerApproval && next.reviewerApproval ? 'closed' : 'open';
          return next;
        }),
      }));
      persistRunDetails(runId);
      if (!wasClosed && get().runs.find((r) => r.id === runId)?.status === 'closed') {
        get().toast('Run closed · tester and reviewer approved');
      }
    },

    duplicateRun: (runId) => {
      const src = get().runs.find((r) => r.id === runId);
      if (!src) return;
      const name = `${src.name} (copy)`;
      const date = new Date().toISOString().slice(0, 10);
      const dir = relJoin(RUNS_REL, runFileStem(name, date));
      const rows: RunRow[] = src.rows.map((r, i) => {
        // Re-snapshot from the live case where possible; otherwise carry the source snapshot.
        const snap = snapshotItemText(r.case_id);
        return {
          case_id: r.case_id,
          display_id: r.display_id,
          title: r.title,
          result: 'not_run',
          tester: '',
          executed_at: '',
          notes: '',
          checks: {},
          failNotes: {},
          itemText: Object.keys(snap).length ? snap : { ...(r.itemText ?? {}) },
          file: relJoin(dir, runCaseFileName(i, { display_id: r.display_id, title: r.title })),
        };
      });
      const run: Run = {
        id: dir,
        name,
        file: dir,
        created: date,
        testDate: date,
        status: 'open',
        scope: src.scope,
        rows,
        summary: '',
        notes: '',
        testerApproval: null,
        reviewerApproval: null,
      };
      set((s) => ({ runs: [run, ...s.runs], sel: { ...s.sel, kind: 'run', runId: run.id, guideIndex: 0 }, view: 'run' }));
      upsertChange({ kind: 'run', refId: run.id, path: run.file, status: 'A', label: run.name });
      writeWholeRun(run);
      get().toast(`Run duplicated · ${rows.length} cases reset`);
    },

    deleteRun: async (runId) => {
      const run = get().runs.find((r) => r.id === runId);
      if (!run) return;
      if (
        !(await get().confirm({
          title: `Delete run "${run.name}"?`,
          message: 'This removes the run and all its recorded results from disk.',
          confirmLabel: 'Delete',
          danger: true,
        }))
      )
        return;
      set((s) => {
        // If the deleted run was open (run view / guide), drop back to the runs list.
        const wasActive = s.sel.runId === runId;
        return {
          runs: s.runs.filter((r) => r.id !== runId),
          sel: wasActive ? { ...s.sel, runId: null, guideIndex: undefined } : s.sel,
          view: wasActive && (s.view === 'run' || s.view === 'guide') ? 'runs' : s.view,
        };
      });
      upsertChange({ kind: 'run', refId: runId, path: run.file, status: 'D', label: run.name });
      const rp = get().repoPath;
      if (rp) void deletePath(rp, run.file).then(scheduleRefresh).catch(onWriteError);
      get().toast(`Deleted run "${run.name}"`);
    },

    exportRunToPdf: async (runId) => {
      const { runs, cases, tree, repoPath } = get();
      const run = runs.find((r) => r.id === runId);
      if (!run) return;
      if (!isNwjs()) {
        get().toast('PDF export needs the desktop app');
        return;
      }
      const model: RunReportModel = {
        runName: run.name,
        status: run.status,
        created: run.created,
        testDate: run.testDate ?? run.created,
        repoName: baseName(repoPath),
        generatedAt: nowStamp(),
        summary: buildRunSummary(run, cases),
        suites: groupRunBySuite(run, cases, tree),
        testerApproval: run.testerApproval,
        reviewerApproval: run.reviewerApproval,
      };
      get().toast('Generating PDF…');
      try {
        const res = await exportRunReport(model);
        if (res.ok && res.path) {
          get().toast('PDF saved');
          // Open the saved PDF in the OS default viewer (url is a properly-encoded file://).
          if (res.url) openExternal(res.url);
        } else if (res.reason !== 'cancelled') {
          get().toast('Could not generate PDF');
        }
      } catch {
        get().toast('Could not generate PDF');
      }
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
        set({ branch: s.branch, ahead: s.ahead, behind: s.behind, changes: groupChanges(s.changes) });
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
          get().toast(`Committed ${paths.length || selectedKeys.length} change(s)`);
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

    /* ---- updates ---- */
    checkForUpdate: async () => {
      if (!isNwjs()) return; // dev preview / browser — nothing to update
      // Skip when a check is in flight or an update is already surfaced — re-polling would
      // re-download the (unchanging) installer and could clobber the "ready"/link banner on a
      // transient failure. A fresh check resumes after a restart, or from the 'error'/'idle' states.
      if (['checking', 'downloading', 'ready', 'unsupported'].includes(get().updateStatus)) return;
      set({ updateStatus: 'checking' });
      try {
        const info = await fetchLatestUpdate(__APP_VERSION__);
        if (!info) {
          set({ updateStatus: 'idle', updateVersion: null, updateReleaseUrl: null });
          return;
        }
        set({ updateStatus: 'available', updateVersion: info.version, updateReleaseUrl: info.htmlUrl });
        // Only installed builds can self-apply; portable builds just link to the release.
        const installable = info.setupUrl != null && (await isInstalledBuild());
        if (!installable) {
          set({ updateStatus: 'unsupported' });
          return;
        }
        set({ updateStatus: 'downloading', updateProgress: 0 });
        try {
          downloadedInstaller = await downloadInstaller(info.setupUrl!, info.version, (pct) =>
            set({ updateProgress: pct }),
          );
          set({ updateStatus: 'ready' });
        } catch {
          // Download failed — fall back to the manual release-page path.
          downloadedInstaller = null;
          set({ updateStatus: 'unsupported' });
        }
      } catch {
        // Network/API hiccup — stay quiet (no startup toast spam); retry next interval.
        set({ updateStatus: 'error' });
      }
    },

    relaunchToUpdate: () => {
      if (!downloadedInstaller) return;
      runInstallerAndQuit(downloadedInstaller);
    },

    openReleasePage: () => {
      const url = get().updateReleaseUrl;
      if (url) openExternal(url);
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
