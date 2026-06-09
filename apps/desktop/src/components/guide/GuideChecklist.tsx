import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { renderInline } from '@/utils/markdown';
import { GuideCheck } from './GuideCheck';

export interface ChecklistItem {
  key: string;
  text: string;
  num?: string;
  depth?: number;
}

export interface GuideChecklistProps {
  title: string;
  caption: string;
  items: ChecklistItem[];
  myChecks: Record<string, boolean>;
  toggle: (key: string) => void;
  numbered?: boolean;
  onAll: () => void;
  onNone: () => void;
}

export function GuideChecklist({ title, caption, items, myChecks, toggle, numbered, onAll, onNone }: GuideChecklistProps) {
  const done = items.filter((it) => myChecks[it.key]).length;
  const allDone = items.length > 0 && done === items.length;
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-panel">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">{title}</span>
        <span className="flex-1 text-[12px] text-ink-faint">{caption}</span>
        <span className="font-mono text-[11.5px] text-ink-faint">
          {allDone ? <span className="inline-flex items-center gap-1 text-pass">{I.check({ size: 12 })} done</span> : `${done}/${items.length}`}
        </span>
        <Button variant="ghost" size="sm" onClick={allDone ? onNone : onAll}>
          {allDone ? 'Clear' : 'Check all'}
        </Button>
      </div>
      <div className="flex flex-col p-1.5">
        {items.length === 0 && <div className="px-0.5 py-1.5 text-[13px] text-ink-3">None specified.</div>}
        {items.map((it) => (
          <GuideCheck
            key={it.key}
            checked={!!myChecks[it.key]}
            onToggle={() => toggle(it.key)}
            num={numbered ? (it.num ?? '') + '.' : null}
            depth={it.depth}
          >
            {renderInline(it.text, it.key)}
          </GuideCheck>
        ))}
      </div>
    </section>
  );
}
