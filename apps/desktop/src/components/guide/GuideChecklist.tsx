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
    <section className="guide-sec">
      <div className="gsec-h">
        <span className="gsec-step">{title}</span>
        <span className="gsec-cap">{caption}</span>
        <span className="gsec-prog mono">
          {allDone ? (
            <span className="gsec-done">{I.check({ size: 12 })} done</span>
          ) : (
            `${done}/${items.length}`
          )}
        </span>
        <Button variant="ghost" size="sm" onClick={allDone ? onNone : onAll}>
          {allDone ? 'Clear' : 'Check all'}
        </Button>
      </div>
      <div className="gcheck-list">
        {items.length === 0 && (
          <div className="muted" style={{ fontSize: 13, padding: '6px 2px' }}>
            None specified.
          </div>
        )}
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
