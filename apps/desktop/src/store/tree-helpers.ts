import type { SuiteNode, TreeNode } from '@/types';

// ---------------------------------------------------------------------------
// Pure helpers over the workspace/suite/case tree. No store access — every
// function takes the tree (or a value) as input, so they're independently
// unit-testable and shared by the store's actions.
// ---------------------------------------------------------------------------

/** Last path segment of a path, tolerating either slash and trailing separators. */
export const baseName = (p: string): string => p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || p;

/** Structural deep clone of plain tree/data values (used before in-place tree edits). */
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Index the tree by suite id → its repo-relative path, its resolved display-ID prefix,
 * and a `inSuite(id)` that lists the case ids beneath a suite.
 *
 * Display-ID prefix resolves by inheritance: a suite uses its own prefix, else the
 * nearest ancestor's, else 'CW'. Workspace roots carry their prefix, so this is uniform.
 */
export function buildSuiteIndex(tree: TreeNode[]) {
  const path: Record<string, string> = {};
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

/** Find a suite node anywhere in the tree by id (depth-first), or `null`. */
export function findSuiteNode(nodes: TreeNode[], id: string): SuiteNode | null {
  for (const n of nodes) {
    if (n.type === 'suite' && n.id === id) return n;
    const r = n.type === 'suite' ? findSuiteNode(n.children, id) : null;
    if (r) return r;
  }
  return null;
}

/** Whether `childId` lives somewhere under the suite `ancestorId`. */
export function isDescendant(tree: TreeNode[], ancestorId: string, childId: string): boolean {
  const a = findSuiteNode(tree, ancestorId);
  if (!a) return false;
  const walk = (n: TreeNode): boolean =>
    n.type === 'suite' && n.children.some((ch) => ch.id === childId || walk(ch));
  return walk(a);
}
