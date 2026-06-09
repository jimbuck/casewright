import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app-store';
import type { Case, Status } from '@/types';
import { ListControl } from './ListControl';
import { ObjectiveEditor } from './ObjectiveEditor';
import { StepsControl } from './StepsControl';
import { TagEditor } from './TagEditor';

const STATUS_TEXT: Record<Status, string> = {
  active: 'text-pass',
  draft: 'text-blocked',
  deprecated: 'text-ink-3 line-through',
};

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
    const prefix = c.displayId.split('-')[0] || ctx.workspace?.prefix || 'CW';
    const used = new Set(ctx.cases.map((x) => x.displayId));
    const pad = (s: number) => `${prefix}-${String(s).padStart(4, '0')}`;
    let n = 1;
    while (used.has(pad(n))) n++;
    return pad(n);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="flex-none border-b border-border px-[26px] pt-[14px]">
        <div className="flex items-center gap-2.5">
          <input
            className="-mx-[7px] -my-[3px] min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-[7px] py-[3px] text-[21px] font-semibold tracking-[-0.01em] text-ink hover:bg-raise focus:border-accent focus:bg-panel focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:outline-none"
            value={c.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Untitled case"
          />
          <Button size="sm" variant="ghost" title="Duplicate" onClick={() => ctx.duplicateCase(c.id)}>
            {I.copy({ size: 14 })} Duplicate
          </Button>
          <Button size="sm" variant="ghost" className="text-fail hover:bg-fail-soft hover:text-fail" title="Delete" onClick={() => ctx.deleteCase(c.id)}>
            {I.trash({ size: 14 })}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 pb-[13px] pt-2.5">
          <div className="inline-flex items-center gap-1.5 font-mono text-[12px]">
            <span className="text-ink-faint">ID</span>
            {idConflict ? (
              <input
                className="h-6 w-[110px] rounded-md border border-blocked bg-blocked-soft px-[7px] py-[3px] font-mono text-[12px] font-semibold text-[oklch(0.46_0.12_66)] shadow-[0_0_0_3px_var(--blocked-soft)] focus:shadow-[0_0_0_3px_oklch(0.85_0.08_80)] focus:outline-none"
                value={c.displayId}
                autoFocus
                title="This ID conflicts — edit to resolve"
                onChange={(e) => patch({ displayId: e.target.value })}
              />
            ) : (
              <span
                className="inline-flex items-center gap-[5px] rounded-sm border border-border bg-sunken px-1.5 py-px text-ink-3"
                title="Human-facing ID · stable · editable only when it conflicts"
              >
                {c.displayId}
                <button
                  className="grid size-[18px] place-items-center rounded-sm hover:bg-raise"
                  onClick={() => ctx.toast('Copied ' + c.displayId)}
                >
                  {I.copy({ size: 12 })}
                </button>
              </span>
            )}
          </div>
          <div className="inline-flex items-center gap-1.5 font-mono text-[12px]">
            <span className="text-ink-faint">Status</span>
            <select
              className={cn(
                'h-[26px] rounded-md border border-border bg-panel px-2 py-0.5 text-[12px] font-semibold',
                STATUS_TEXT[c.status],
              )}
              value={c.status}
              onChange={(e) => patch({ status: e.target.value as Status })}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="deprecated">Deprecated</option>
            </select>
          </div>
          <span className="mx-0.5 my-1.5 w-px self-stretch bg-border" />
          <div className="inline-flex min-w-0 flex-1 items-center gap-1.5 font-mono text-[12px]">
            <span className="text-ink-faint">Tags</span>
            <TagEditor tags={c.tags} onChange={(t) => patch({ tags: t })} />
          </div>
        </div>
        {idConflict && (
          <div className="mb-[13px] flex items-center gap-[9px] rounded-md border border-[oklch(0.85_0.07_80)] bg-blocked-soft px-3 py-2 text-[12.5px] text-[oklch(0.5_0.12_66)]">
            <span className="shrink-0">{I.warn({ size: 15 })}</span>
            <span>
              Display ID <b className="font-mono">{c.displayId}</b> is already used by{' '}
              {clashes.length === 1 ? 'another case' : clashes.length + ' other cases'} (
              {clashes.map((x) => x.title).join(', ')}). IDs must be unique — rename this one or pick the next free
              number.
            </span>
            <Button size="sm" className="ml-auto shrink-0 font-mono" onClick={() => patch({ displayId: nextFreeId() })}>
              Use {nextFreeId()}
            </Button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-[760px] flex-col gap-[26px] px-[26px] pb-20 pt-[26px]">
          <ObjectiveEditor value={c.objective} onChange={(v) => patch({ objective: v })} />
          <hr className="m-0 h-px border-0 bg-border" />
          <ListControl
            icon={I.layers({ size: 15 })}
            title="Systems in Scope"
            mark="## Systems in Scope"
            marker="–"
            items={c.systems}
            onChange={(v) => patch({ systems: v })}
            placeholder="System or component…"
          />
          <hr className="m-0 h-px border-0 bg-border" />
          <StepsControl steps={c.steps} onChange={(v) => patch({ steps: v })} />
          <hr className="m-0 h-px border-0 bg-border" />
          <ListControl
            icon={I.check({ size: 15 })}
            title="Expected Results"
            mark="## Expected Results"
            marker="–"
            items={c.expected}
            onChange={(v) => patch({ expected: v })}
            placeholder="Expected outcome…"
          />
          <div className="flex items-center gap-[7px] rounded-md border border-dashed border-border-2 bg-panel-2 px-3 py-[9px] text-[12px] text-ink-3">
            {I.check({ size: 14 })} Round-trips to four reserved <span className="font-mono">##</span> sections · inline
            formatting only · single trailing newline.
          </div>
        </div>
      </div>

      <div className="flex flex-none items-center gap-2.5 border-t border-border bg-panel-2 px-[26px] py-[7px] font-mono text-[11.5px] text-ink-faint">
        <span className="grid place-items-center text-ink-3">{I.file({ size: 13 })}</span>
        <span>{path}</span>
        <span className={cn('ml-auto inline-flex items-center gap-[5px]', c.modified ? 'text-blocked' : 'text-pass')}>
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
