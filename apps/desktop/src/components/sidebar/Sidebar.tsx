import { useMemo, useRef, useState, type DragEvent } from 'react';
import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { useApp } from '@/store/app-store';
import type { Case, Status, SuiteNode, TreeNode } from '@/types';
import { ContextMenu, type MenuItem } from './ContextMenu';

interface FlatRow {
  id: string;
  type: 'case' | 'suite';
  depth: number;
  node: TreeNode;
  open?: boolean;
}
interface DropPos {
  gap: number;
  depth: number;
  y: number;
}
interface Menu {
  x: number;
  y: number;
  node: TreeNode;
}

function findSuiteNode(nodes: TreeNode[], id: string): SuiteNode | null {
  for (const n of nodes) {
    if (n.type === 'suite' && n.id === id) return n;
    const r = n.type === 'suite' ? findSuiteNode(n.children, id) : null;
    if (r) return r;
  }
  return null;
}

export function Sidebar() {
  const {
    cases,
    tree,
    sel,
    view,
    openCase,
    openRunsList,
    collapsed,
    setCollapsed,
    renaming,
    setRenaming,
    createSuite,
    createCase,
    renameSuite,
    deleteSuite,
    deleteCase,
    duplicateCase,
    moveNodeToParent,
    casePath,
    toast,
  } = useApp();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [dropPos, setDropPos] = useState<DropPos | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => Object.fromEntries(cases.map((c) => [c.id, c])), [cases]);
  const allTags = useMemo(() => {
    const s = new Set<string>();
    cases.forEach((c) => c.tags.forEach((t) => s.add(t)));
    return [...s].sort();
  }, [cases]);

  const filtering = !!(q || status || tag);

  const matches = (c: Case | undefined): c is Case => {
    if (!c) return false;
    if (status && c.status !== status) return false;
    if (tag && !c.tags.includes(tag)) return false;
    if (q) {
      const hay = (
        c.title +
        ' ' +
        c.displayId +
        ' ' +
        c.objective +
        ' ' +
        c.steps.map((s) => s.text).join(' ') +
        ' ' +
        c.systems.join(' ') +
        ' ' +
        c.expected.join(' ') +
        ' ' +
        c.tags.join(' ')
      ).toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  };

  const subtreeHas = (node: TreeNode): boolean => {
    if (node.type === 'case') return matches(byId[node.id]);
    return node.children.some(subtreeHas);
  };

  const commitRename = () => {
    if (renaming && renaming.value.trim()) renameSuite(renaming.id, renaming.value.trim());
    setRenaming(null);
  };

  // ---- flattened visible rows (drag excluded), for the steps-style insertion line ----
  const flat = useMemo(() => {
    const out: FlatRow[] = [];
    const walk = (nodes: TreeNode[], depth: number) =>
      nodes.forEach((n) => {
        if (n.id === drag) return; // skip the dragged subtree entirely
        if (n.type === 'case') {
          const c = byId[n.id];
          if (filtering && !matches(c)) return;
          out.push({ id: n.id, type: 'case', depth, node: n });
        } else {
          if (filtering && !subtreeHas(n)) return;
          out.push({ id: n.id, type: 'suite', depth, node: n, open: !collapsed[n.id] });
          if (!collapsed[n.id]) walk(n.children, depth + 1);
        }
      });
    walk(tree, 0);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, drag, collapsed, q, status, tag, cases]);
  const flatIndex = useMemo(() => {
    const m: Record<string, number> = {};
    flat.forEach((f, i) => (m[f.id] = i));
    return m;
  }, [flat]);

  // deepest nesting allowed at a gap = (suite just above → its depth + 1) else (sibling depth)
  const maxDepthAt = (gap: number) => {
    const above = flat[gap - 1];
    if (!above) return 0;
    return above.type === 'suite' ? above.depth + 1 : above.depth;
  };
  // resolve a (gap, depth) into a concrete parent suite + insertion index
  const resolveDrop = (gap: number, depth: number) => {
    let parentId: string | null = null;
    if (depth > 0) {
      for (let i = gap - 1; i >= 0; i--) {
        const f = flat[i];
        if (f.type === 'suite' && f.depth === depth - 1) {
          parentId = f.id;
          break;
        }
        if (f.depth < depth - 1) break;
      }
      if (parentId == null)
        for (let i = gap - 1; i >= 0; i--) {
          const f = flat[i];
          if (f.type === 'suite' && f.depth < depth) {
            parentId = f.id;
            break;
          }
        }
    }
    const parent = parentId ? findSuiteNode(tree, parentId) : null;
    const arr = parent ? parent.children : tree;
    let index = 0;
    arr.forEach((ch) => {
      const cfi = flatIndex[ch.id];
      if (cfi != null && cfi < gap) index++;
    });
    return { parentId, index };
  };

  // ---- drag-and-drop (overlay indicator — never reflows rows, so no flicker) ----
  const onRowDragOver = (node: TreeNode) => (e: DragEvent) => {
    if (drag == null || filtering) return;
    e.preventDefault();
    e.stopPropagation();
    const fi = flatIndex[node.id];
    if (fi == null) return; // this is the dragged row
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const before = e.clientY - r.top < r.height / 2;
    const gap = before ? fi : fi + 1;
    const maxD = maxDepthAt(gap);
    const baseLeft = innerRef.current ? innerRef.current.getBoundingClientRect().left : r.left;
    let depth = Math.round((e.clientX - baseLeft - 22) / 15);
    depth = Math.max(0, Math.min(maxD, depth));
    const y = before ? el.offsetTop : el.offsetTop + el.offsetHeight;
    setDropPos((p) => (p && p.gap === gap && p.depth === depth && p.y === y ? p : { gap, depth, y }));
  };
  const onTreeDragOver = (e: DragEvent) => {
    if (drag == null || filtering) return;
    if ((e.target as HTMLElement).closest?.('.tree-section-h')) return;
    e.preventDefault();
    const y = tailRef.current ? tailRef.current.offsetTop : 0;
    setDropPos((p) => (p && p.gap === flat.length && p.depth === 0 && p.y === y ? p : { gap: flat.length, depth: 0, y }));
  };
  const doDrop = (e?: DragEvent) => {
    if (drag == null || dropPos == null) {
      endDrag();
      return;
    }
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const { parentId, index } = resolveDrop(dropPos.gap, dropPos.depth);
    moveNodeToParent(drag, parentId, index);
    endDrag();
  };
  const endDrag = () => {
    setDrag(null);
    setDropPos(null);
  };

  // ---- context menu ----
  const openMenu = (node: TreeNode) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, node });
  };
  const closeMenu = () => setMenu(null);

  const menuItems = (node: TreeNode | undefined): MenuItem[] => {
    if (!node) return [];
    if (node.type === 'case') {
      const c = byId[node.id];
      if (!c) return [];
      return [
        { icon: I.eye, label: 'Open', on: () => openCase(c.id) },
        { icon: I.copy, label: 'Duplicate', on: () => duplicateCase(c.id) },
        { icon: I.file, label: 'New case in this suite', on: () => createCase(c.suite) },
        { sep: true },
        { icon: I.tag, label: 'Copy ID', sub: c.displayId, on: () => toast('Copied ' + c.displayId) },
        { icon: I.link, label: 'Copy path', on: () => toast('Copied path') },
        { icon: I.folderOpen, label: 'Reveal in File Explorer', desktop: true, on: () => toast('nw.Shell.showItemInFolder — ' + casePath(c).split('/').pop()) },
        { icon: I.code, label: 'Open in default editor', desktop: true, on: () => toast('nw.Shell.openItem — opened externally') },
        { sep: true },
        { icon: I.trash, label: 'Delete', danger: true, on: () => deleteCase(c.id) },
      ];
    }
    return [
      { icon: I.file, label: 'New case', on: () => createCase(node.id) },
      { icon: I.folder, label: 'New nested suite', on: () => createSuite(node.id) },
      { icon: I.edit, label: 'Rename', on: () => setRenaming({ id: node.id, value: node.name }) },
      {
        icon: collapsed[node.id] ? I.chevronDown : I.chevron,
        label: collapsed[node.id] ? 'Expand' : 'Collapse',
        on: () => setCollapsed((s) => ({ ...s, [node.id]: !collapsed[node.id] })),
      },
      { sep: true },
      { icon: I.link, label: 'Copy folder path', sub: node.path, on: () => toast('Copied ' + node.path) },
      { icon: I.folderOpen, label: 'Reveal in File Explorer', desktop: true, on: () => toast('nw.Shell.showItemInFolder — ' + node.name) },
      { sep: true },
      { icon: I.trash, label: 'Delete suite', danger: true, on: () => deleteSuite(node.id) },
    ];
  };

  const renderNode = (node: TreeNode, depth: number) => {
    if (node.type === 'case') {
      const c = byId[node.id];
      if (!matches(c)) return null;
      const active = sel.kind === 'case' && sel.id === c.id;
      return (
        <div key={c.id} className="drag-wrap">
          <div
            className={
              'row case-row' +
              (active ? ' sel' : '') +
              (c.status === 'deprecated' ? ' deprecated' : '') +
              (drag === c.id ? ' dragging' : '')
            }
            style={{ paddingLeft: 8 + depth * 15 }}
            draggable={!filtering}
            onDragStart={(e) => {
              if (filtering) {
                e.preventDefault();
                return;
              }
              setDrag(c.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={endDrag}
            onDragOver={onRowDragOver(node)}
            onDrop={doDrop}
            onContextMenu={openMenu(node)}
            onClick={() => openCase(c.id)}
          >
            <span className="twist" />
            <span className="ricon2">{I.file({ size: 14 })}</span>
            <span className="rlabel">{c.title}</span>
            {c.modified && <span className="moddot" title="Unsaved / uncommitted" />}
            <span className="rdid">{c.displayId}</span>
          </div>
        </div>
      );
    }
    if (!subtreeHas(node) && filtering) return null;
    const isOpen = !collapsed[node.id];
    const count = node.children.filter((n) => n.type === 'case').length;
    const isRenaming = !!renaming && renaming.id === node.id;
    return (
      <div key={node.id} className="drag-wrap">
        <div
          className={'row suite-row' + (drag === node.id ? ' dragging' : '')}
          style={{ paddingLeft: 6 + depth * 15 }}
          draggable={!filtering && !isRenaming}
          onDragStart={(e) => {
            if (filtering || isRenaming) {
              e.preventDefault();
              return;
            }
            setDrag(node.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={endDrag}
          onDragOver={onRowDragOver(node)}
          onDrop={doDrop}
          onContextMenu={openMenu(node)}
          onClick={() => !isRenaming && setCollapsed((s) => ({ ...s, [node.id]: isOpen }))}
        >
          <span className="twist">{isOpen ? I.chevronDown({ size: 13 }) : I.chevron({ size: 13 })}</span>
          <span className="ricon2">{isOpen ? I.folderOpen({ size: 15 }) : I.folder({ size: 15 })}</span>
          {isRenaming ? (
            <input
              className="suite-rename"
              autoFocus
              value={renaming!.value}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenaming({ id: node.id, value: e.target.value })}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenaming(null);
              }}
            />
          ) : (
            <span
              className="rlabel"
              style={{ fontWeight: 500 }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setRenaming({ id: node.id, value: node.name });
              }}
            >
              {node.name}
            </span>
          )}
          <span className="row-actions">
            <button
              className="ra-btn"
              title="New case in this suite"
              onClick={(e) => {
                e.stopPropagation();
                createCase(node.id);
              }}
            >
              {I.file({ size: 13 })}
              <span className="ra-plus">+</span>
            </button>
            <button
              className="ra-btn"
              title="New nested suite"
              onClick={(e) => {
                e.stopPropagation();
                createSuite(node.id);
              }}
            >
              {I.folder({ size: 13 })}
              <span className="ra-plus">+</span>
            </button>
          </span>
          {!isRenaming && <span className="scount">{count || ''}</span>}
        </div>
        {isOpen && node.children.map((ch) => renderNode(ch, depth + 1))}
      </div>
    );
  };

  const anyVisible = tree.some(subtreeHas);
  const runsActive = view === 'runs' || view === 'run' || view === 'guide';

  return (
    <aside className="sidebar">
      <div className="side-nav">
        <button className={'nav-tab' + (!runsActive ? ' on' : '')} onClick={() => sel.id && openCase(sel.id)}>
          {I.layers({ size: 14 })} Cases
        </button>
        <button className={'nav-tab' + (runsActive ? ' on' : '')} onClick={openRunsList}>
          {I.grid({ size: 14 })} Runs
        </button>
      </div>

      <div className="side-search">
        <div className="search-box">
          {I.search({ size: 14 })}
          <input className="input" placeholder="Search cases…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="filter-row">
          {(['active', 'draft', 'deprecated'] as Status[]).map((s) => (
            <button
              key={s}
              className={'fchip' + (status === s ? ' on' : '')}
              style={{ textTransform: 'capitalize' }}
              onClick={() => setStatus(status === s ? null : s)}
            >
              <span
                className="dot"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 99,
                  background: s === 'active' ? 'var(--pass)' : s === 'draft' ? 'var(--blocked)' : 'var(--ink-faint)',
                }}
              />
              {s}
            </button>
          ))}
        </div>
        {allTags.length > 0 && (
          <div className="filter-row">
            {allTags.map((t) => (
              <button key={t} className={'fchip' + (tag === t ? ' on' : '')} onClick={() => setTag(tag === t ? null : t)}>
                <span className="fx">#</span>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="tree" ref={treeRef} onDragOver={onTreeDragOver} onDrop={doDrop}>
        <div className="tree-inner" ref={innerRef}>
          <div className="tree-section-h">
            <span>Suites</span>
            <span className="tsh-actions">
              <Button size="sm" variant="ghost" title="New top-level case" onClick={() => createCase(null)}>
                {I.file({ size: 13 })} Case
              </Button>
              <Button size="sm" variant="ghost" title="New top-level suite" onClick={() => createSuite(null)}>
                {I.folder({ size: 13 })} Suite
              </Button>
            </span>
          </div>
          {anyVisible ? (
            tree.map((n) => renderNode(n, 0))
          ) : (
            <div className="tree-empty">
              No cases match.
              <br />
              Adjust search or filters.
            </div>
          )}
          <div className="tree-tail" ref={tailRef} />
          {drag != null && dropPos && (
            <div className="drop-line tree-abs" style={{ top: dropPos.y, left: 10 + dropPos.depth * 15 }} />
          )}
        </div>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.node)} onClose={closeMenu} />}
    </aside>
  );
}
