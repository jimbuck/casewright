import { I } from '@/components/icons';
import { Button, Input } from '@/components/ui';
import { renderInline } from '@/utils/markdown';
import type { ChecklistItem } from '@/utils/run-items';
import type { CheckState } from '@/types';
import { GuideCheck } from './GuideCheck';

export type { ChecklistItem };

export interface GuideChecklistProps {
  title: string;
  caption: string;
  items: ChecklistItem[];
  myChecks: Record<string, CheckState>;
  failNotes: Record<string, string>;
  cycle: (key: string) => void;
  onFailNote: (key: string, value: string) => void;
  setGroup: (state: CheckState) => void;
  numbered?: boolean;
}

export function GuideChecklist({ title, caption, items, myChecks, failNotes, cycle, onFailNote, setGroup, numbered }: GuideChecklistProps) {
  const resolved = items.filter((it) => (myChecks[it.key] ?? 'none') !== 'none').length;
  const allPass = items.length > 0 && items.every((it) => myChecks[it.key] === 'pass');
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-panel">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">{title}</span>
        <span className="flex-1 text-[12px] text-ink-faint">{caption}</span>
        <span className="font-mono text-[11.5px] text-ink-faint">
          {allPass ? <span className="inline-flex items-center gap-1 text-pass">{I.check({ size: 12 })} done</span> : `${resolved}/${items.length}`}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setGroup(allPass ? 'none' : 'pass')}>
          {allPass ? 'Clear' : 'Pass all'}
        </Button>
      </div>
      <div className="flex flex-col p-1.5">
        {items.length === 0 && <div className="px-0.5 py-1.5 text-[13px] text-ink-3">None specified.</div>}
        {items.map((it) => {
          const state = myChecks[it.key] ?? 'none';
          return (
            <div key={it.key}>
              <GuideCheck state={state} onToggle={() => cycle(it.key)} num={numbered ? (it.num ?? '') + '.' : null} depth={it.depth}>
                {renderInline(it.text, it.key)}
                {it.body?.trim() && (
                  <span className="mt-1 block whitespace-pre-wrap text-[13px] font-normal leading-[1.55] text-ink-3">
                    {renderInline(it.body, it.key + '-body')}
                  </span>
                )}
              </GuideCheck>
              {state === 'fail' && (
                <div className="mb-1 ml-[42px] mr-2" style={it.depth ? { marginLeft: 42 + it.depth * 26 } : undefined}>
                  <Input
                    className="text-[12.5px]"
                    value={failNotes[it.key] ?? ''}
                    placeholder="What failed? (added to the defect report)"
                    onChange={(e) => onFailNote(it.key, e.target.value)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
