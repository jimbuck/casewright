import { useMemo, useState, type ReactNode } from 'react';
import { I } from '@/components/icons';
import { Button, Field, Input, Modal, ModalBody, ModalFooter, ModalHeader, Select } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app-store';
import type { Case, TreeNode } from '@/types';

type NodeState = 'on' | 'off' | 'partial';

/** A tri-state checkbox: checked / indeterminate / empty. */
function TriBox({ state }: { state: NodeState }) {
  if (state === 'on')
    return (
      <span className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-accent bg-accent text-white">
        {I.check({ size: 12 })}
      </span>
    );
  if (state === 'partial')
    return (
      <span className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-accent bg-accent-soft text-accent">
        <span className="h-[2px] w-2.5 rounded-full bg-accent" />
      </span>
    );
  return <span className="size-[18px] shrink-0 rounded-[5px] border-[1.5px] border-border-2 bg-panel" />;
}

export function CreateRunModal() {
  const ctx = useApp();
  const close = () => ctx.setModal(null);
  const allTags = useMemo(() => [...new Set(ctx.cases.flatMap((c) => c.tags))].sort(), [ctx.cases]);
  const byId = useMemo(() => new Map(ctx.cases.map((c) => [c.id, c] as const)), [ctx.cases]);

  const [name, setName] = useState('');
  const [tag, setTag] = useState(allTags[0] ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(ctx.tree.map((n) => (n.type === 'suite' ? n.id : ''))));

  // Precompute suite id → all descendant case ids once (avoids rebuilding the suite
  // index on every node visit, which was O(N²) across the whole tree render).
  const caseIdsBySuite = useMemo(() => {
    const map = new Map<string, string[]>();
    const collect = (node: TreeNode): string[] => {
      if (node.type === 'case') return [node.id];
      const ids = node.children.flatMap(collect);
      map.set(node.id, ids);
      return ids;
    };
    ctx.tree.forEach(collect);
    return map;
  }, [ctx.tree]);

  // Case ids beneath a suite/workspace node (recurses into sub-suites).
  const caseIdsUnder = (node: TreeNode): string[] =>
    node.type === 'case' ? [node.id] : (caseIdsBySuite.get(node.id) ?? []);

  const nodeState = (node: TreeNode): NodeState => {
    if (node.type === 'case') return selected.has(node.id) ? 'on' : 'off';
    const ids = caseIdsUnder(node);
    if (ids.length === 0) return 'off';
    const on = ids.filter((id) => selected.has(id)).length;
    return on === 0 ? 'off' : on === ids.length ? 'on' : 'partial';
  };

  const toggleNode = (node: TreeNode) => {
    const ids = caseIdsUnder(node);
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = ids.length > 0 && ids.every((id) => next.has(id));
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAll = () => setSelected(new Set(ctx.cases.map((c) => c.id)));
  const clearAll = () => setSelected(new Set());
  const addTag = () => {
    const ids = ctx.cases.filter((c) => c.tags.includes(tag)).map((c) => c.id);
    setSelected((prev) => new Set([...prev, ...ids]));
  };

  const count = selected.size;
  const scopeLabel = count === ctx.cases.length && count > 0 ? 'repo' : `custom (${count} ${count === 1 ? 'case' : 'cases'})`;

  // ---- recursive tree rows ----
  const renderNodes = (nodes: TreeNode[], depth: number): ReactNode[] =>
    nodes.flatMap((node) => {
      const pad = { paddingLeft: 8 + depth * 18 };
      if (node.type === 'case') {
        const c: Case | undefined = byId.get(node.id);
        return (
          <button
            key={node.id}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-[5px] text-left hover:bg-raise"
            style={pad}
            onClick={() => toggleNode(node)}
          >
            <TriBox state={nodeState(node)} />
            <span className="font-mono text-[11px] text-ink-3">{c?.displayId ?? '—'}</span>
            <span className="truncate text-[13px] text-ink">{c?.title ?? node.id}</span>
          </button>
        );
      }
      const open = expanded.has(node.id);
      const rows: ReactNode[] = [
        <div key={node.id} className="flex items-center gap-1 rounded-md hover:bg-raise" style={pad}>
          <button className="grid size-5 shrink-0 place-items-center text-ink-faint" onClick={() => toggleExpand(node.id)} title={open ? 'Collapse' : 'Expand'}>
            {I.chevron({ size: 14, style: { transform: open ? 'rotate(90deg)' : 'none' } })}
          </button>
          <button className="flex flex-1 items-center gap-2.5 py-[5px] text-left" onClick={() => toggleNode(node)}>
            <TriBox state={nodeState(node)} />
            <span className="grid place-items-center text-ink-faint">
              {node.isWorkspace ? I.workspace({ size: 14 }) : I.folder({ size: 14 })}
            </span>
            <span className="text-[13px] font-semibold">{node.name}</span>
            <span className="font-mono text-[11px] text-ink-faint">{caseIdsUnder(node).length}</span>
          </button>
        </div>,
      ];
      if (open) rows.push(...renderNodes(node.children, depth + 1));
      return rows;
    });

  return (
    <Modal onClose={close}>
      <ModalHeader>
        <span className="grid place-items-center text-accent">{I.grid({ size: 18 })}</span>
        <h3>New test run</h3>
      </ModalHeader>
      <ModalBody style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Run name">
          <Input value={name} placeholder="e.g. Regression — Sprint 13" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Cases — check workspaces, suites, or individual cases">
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <Button variant="ghost" size="sm" onClick={selectAll}>
              Select all (repo)
            </Button>
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Clear
            </Button>
            {allTags.length > 0 && (
              <span className="ml-auto flex items-center gap-1.5">
                {I.tag({ size: 13 })}
                <Select className="w-auto" value={tag} onChange={(e) => setTag(e.target.value)}>
                  {allTags.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
                <Button variant="ghost" size="sm" onClick={addTag}>
                  {I.plus({ size: 12 })} Add tag
                </Button>
              </span>
            )}
          </div>
          <div className="max-h-[280px] overflow-auto rounded-md border border-border bg-panel p-1">
            {ctx.tree.length === 0 ? (
              <div className="px-2 py-3 text-[13px] text-ink-3">No cases yet.</div>
            ) : (
              renderNodes(ctx.tree, 0)
            )}
          </div>
        </Field>
        <div className="text-[12.5px] text-ink-3">
          {I.layers({ size: 13 })} Seeds <b>{count}</b> {count === 1 ? 'case' : 'cases'} · keyed on stable{' '}
          <span className="font-mono">case_id</span> · written as a folder under <span className="font-mono">.casewright/runs/</span>.
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!name.trim() || count === 0}
          onClick={() => ctx.createRun({ name: name.trim(), caseIds: [...selected], scopeLabel })}
        >
          {I.plus({ size: 14 })} Create run
        </Button>
      </ModalFooter>
    </Modal>
  );
}
