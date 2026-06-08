import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { useApp } from '@/store/app-store';
import type { Case, Status } from '@/types';
import { ListControl } from './ListControl';
import { ObjectiveEditor } from './ObjectiveEditor';
import { StepsControl } from './StepsControl';
import { TagEditor } from './TagEditor';

export function CaseEditor() {
  const ctx = useApp();
  const c = ctx.cases.find((x) => x.id === ctx.sel.id);
  if (!c) return null;
  const patch = (p: Partial<Case>) => ctx.updateCase(c.id, p);
  const path = ctx.casePath(c);

  // a displayId is read-only unless it collides with another case in the workspace
  const clashes = ctx.cases.filter(
    (x) => x.id !== c.id && x.displayId.trim().toLowerCase() === c.displayId.trim().toLowerCase(),
  );
  const idConflict = clashes.length > 0;
  const nextFreeId = () => {
    const prefix = c.displayId.split('-')[0] || ctx.workspace.prefix;
    const used = new Set(ctx.cases.map((x) => x.displayId));
    const pad = (s: number) => `${prefix}-${String(s).padStart(4, '0')}`;
    let n = 1;
    while (used.has(pad(n))) n++;
    return pad(n);
  };

  return (
    <div className="center">
      <div className="editor-head">
        <div className="eh-top">
          <input
            className="eh-title-input"
            value={c.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Untitled case"
          />
          <Button size="sm" variant="ghost" title="Duplicate" onClick={() => ctx.duplicateCase(c.id)}>
            {I.copy({ size: 14 })} Duplicate
          </Button>
          <Button size="sm" variant="ghost" className="danger" title="Delete" onClick={() => ctx.deleteCase(c.id)}>
            {I.trash({ size: 14 })}
          </Button>
        </div>
        <div className="eh-meta">
          <div className="id-field">
            <span className="lbl">ID</span>
            {idConflict ? (
              <input
                className="input did-input conflict"
                value={c.displayId}
                autoFocus
                title="This ID conflicts — edit to resolve"
                onChange={(e) => patch({ displayId: e.target.value })}
              />
            ) : (
              <span className="ro" title="Human-facing ID · stable · editable only when it conflicts">
                {c.displayId}
                <button
                  className="btn icon sm ghost"
                  style={{ width: 18, height: 18 }}
                  onClick={() => ctx.toast('Copied ' + c.displayId)}
                >
                  {I.copy({ size: 12 })}
                </button>
              </span>
            )}
          </div>
          <div className="id-field">
            <span className="lbl">Status</span>
            <select
              className={'status-select status-' + c.status}
              value={c.status}
              onChange={(e) => patch({ status: e.target.value as Status })}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="deprecated">Deprecated</option>
            </select>
          </div>
          <span className="vr" />
          <div className="id-field" style={{ minWidth: 0, flex: 1 }}>
            <span className="lbl">Tags</span>
            <TagEditor tags={c.tags} onChange={(t) => patch({ tags: t })} />
          </div>
        </div>
        {idConflict && (
          <div className="id-conflict-bar">
            {I.warn({ size: 15 })}
            <span>
              Display ID <b>{c.displayId}</b> is already used by{' '}
              {clashes.length === 1 ? 'another case' : clashes.length + ' other cases'} (
              {clashes.map((x) => x.title).join(', ')}). IDs must be unique — rename this one or pick the next free
              number.
            </span>
            <Button size="sm" onClick={() => patch({ displayId: nextFreeId() })}>
              Use {nextFreeId()}
            </Button>
          </div>
        )}
      </div>

      <div className="editor-scroll">
        <div className="editor-body">
          <ObjectiveEditor value={c.objective} onChange={(v) => patch({ objective: v })} />
          <hr className="divider" />
          <ListControl
            icon={I.layers({ size: 15 })}
            title="Systems in Scope"
            mark="## Systems in Scope"
            marker="–"
            items={c.systems}
            onChange={(v) => patch({ systems: v })}
            placeholder="System or component…"
          />
          <hr className="divider" />
          <StepsControl steps={c.steps} onChange={(v) => patch({ steps: v })} />
          <hr className="divider" />
          <ListControl
            icon={I.check({ size: 15 })}
            title="Expected Results"
            mark="## Expected Results"
            marker="–"
            items={c.expected}
            onChange={(v) => patch({ expected: v })}
            placeholder="Expected outcome…"
          />
          <div className="lint-note">
            {I.check({ size: 14 })} Round-trips to four reserved <span className="mono">##</span> sections · inline
            formatting only · single trailing newline.
          </div>
        </div>
      </div>

      <div className="editor-foot">
        <span className="ricon2">{I.file({ size: 13 })}</span>
        <span>{path}</span>
        <span style={{ marginLeft: 'auto' }} className={c.modified ? 'unsaved' : 'saved'}>
          {c.modified ? (
            <>
              {I.dot({ size: 9 })} uncommitted changes
            </>
          ) : (
            <>
              {I.check({ size: 13 })} committed
            </>
          )}
        </span>
      </div>
    </div>
  );
}
