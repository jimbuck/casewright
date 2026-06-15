import { schedulePersist } from '@/services/persist';
import { deletePath, folderNoteRel, makeDir, moveFolderNote, renamePath, syncFolderNote } from '@/services/repo';
import type { Case, TreeNode } from '@/types';
import { folderSlug, randomId, slug } from '@/utils/ids';
import { baseName, buildSuiteIndex, clone, findSuiteNode, isDescendant } from '../tree-helpers';
import type { StoreInternals } from '../store-internals';
import type { AppState, StoreGet, StoreSet } from '../app-store';

// ---------------------------------------------------------------------------
// Case + suite mutations: create/duplicate/delete/edit cases (with undo/redo),
// create/rename/delete suites, edit suite metadata, and drag-and-drop moves.
// Disk persistence + change tracking are delegated to the shared internals.
// ---------------------------------------------------------------------------

type CasesSlice = Pick<
  AppState,
  | 'updateCase'
  | 'undo'
  | 'redo'
  | 'duplicateCase'
  | 'deleteCase'
  | 'createCase'
  | 'createSuite'
  | 'renameSuite'
  | 'deleteSuite'
  | 'moveNodeToParent'
  | 'updateSuite'
>;

export function createCasesSlice(set: StoreSet, get: StoreGet, internals: StoreInternals): CasesSlice {
  const {
    history,
    casePath,
    suiteRel,
    workspaceOfPath,
    upsertChange,
    writeCaseNow,
    deleteCaseOnDisk,
    scheduleRefresh,
    onWriteError,
    reseed,
    lastCasePath,
    writeSuiteNote,
  } = internals;

  return {
    updateCase: (id, patch) => {
      const c = get().cases.find((x) => x.id === id);
      history.recordEdit(id, patch); // snapshot the pre-edit state for undo (before we mutate)
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

    undo: () => history.undo(),

    redo: () => history.redo(),

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
      history.pruneHistory(id); // the case is gone — its undo/redo snapshots can't be restored
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
  };
}
