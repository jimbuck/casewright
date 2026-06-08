import { Fragment, useRef, useState } from 'react';
import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { numberSteps } from '@/utils/steps';
import type { Step } from '@/types';

export interface StepsControlProps {
  steps: Step[];
  onChange: (steps: Step[]) => void;
}

/** Steps — ordered, nestable list (Tab to nest, drag ↔ to re-parent). */
export function StepsControl({ steps, onChange }: StepsControlProps) {
  const refs = useRef<Record<number, HTMLInputElement | null>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [dropDepth, setDropDepth] = useState(0);
  const nums = numberSteps(steps);

  const setText = (i: number, v: string) => onChange(steps.map((s, j) => (j === i ? { ...s, text: v } : s)));
  const setDepth = (i: number, d: number) =>
    onChange(steps.map((s, j) => (j === i ? { ...s, depth: Math.max(0, Math.min(3, d)) } : s)));
  const remove = (i: number) => onChange(steps.filter((_, j) => j !== i));
  const addAfter = (i: number) => {
    const d = i >= 0 ? steps[i].depth : 0;
    const next = steps.slice();
    next.splice(i + 1, 0, { text: '', depth: d });
    onChange(next);
    requestAnimationFrame(() => refs.current[i + 1]?.focus());
  };

  // deepest nesting allowed at a gap = (depth of the item just above it) + 1
  const maxDepthAt = (gap: number) => {
    const arr = drag !== null ? steps.filter((_, j) => j !== drag) : steps;
    const gapND = drag !== null && drag < gap ? gap - 1 : gap;
    const prev = arr[gapND - 1];
    return Math.min(3, prev ? prev.depth + 1 : 0);
  };
  const rowOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const before = e.clientY - r.top < r.height / 2;
    const gap = before ? i : i + 1;
    const maxD = maxDepthAt(gap);
    const baseLeft = listRef.current ? listRef.current.getBoundingClientRect().left : r.left;
    let depth = Math.round((e.clientX - baseLeft - 44) / 22);
    depth = Math.max(0, Math.min(maxD, depth));
    setDropIdx(gap);
    setDropDepth(depth);
  };
  const doDrop = (e?: React.DragEvent) => {
    if (e) e.preventDefault();
    if (drag !== null && dropIdx !== null) {
      let at = dropIdx;
      if (drag < dropIdx) at -= 1;
      const next = steps.slice();
      const [x] = next.splice(drag, 1);
      next.splice(at, 0, { ...x, depth: dropDepth });
      onChange(next);
    }
    setDrag(null);
    setDropIdx(null);
  };
  const endDrag = () => {
    setDrag(null);
    setDropIdx(null);
  };

  return (
    <div className="section">
      <div className="section-h">
        <span className="ricon2" style={{ color: 'var(--ink-3)' }}>
          {I.list({ size: 15 })}
        </span>
        <span className="sh-title">Steps</span>
        <span className="sh-mark">## Steps</span>
        <span className="sh-spacer" />
        <span className="muted" style={{ fontSize: 11 }}>
          Tab to nest · drag ↔ to re-parent
        </span>
      </div>
      <div className="item-list compact" ref={listRef} onDragOver={(e) => e.preventDefault()} onDrop={() => doDrop()}>
        {steps.map((s, i) => (
          <Fragment key={i}>
            {drag !== null && dropIdx === i && <div className="drop-line" style={{ marginLeft: dropDepth * 22 }} />}
            <div
              className={'litem step-litem' + (s.depth > 0 ? ' sub' : '') + (drag === i ? ' dragging' : '')}
              style={{ marginLeft: s.depth * 22 }}
              onDragOver={rowOver(i)}
              onDrop={doDrop}
            >
              <span className="grip" draggable onDragStart={() => setDrag(i)} onDragEnd={endDrag}>
                {I.drag({ size: 14 })}
              </span>
              <span className="step-num">{nums[i]}.</span>
              <input
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className="li-input"
                value={s.text}
                placeholder="Describe the action…"
                onChange={(e) => setText(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAfter(i);
                  } else if (e.key === 'Tab') {
                    e.preventDefault();
                    setDepth(i, s.depth + (e.shiftKey ? -1 : 1));
                  } else if (e.key === 'Backspace' && s.text === '' && steps.length > 1) {
                    e.preventDefault();
                    remove(i);
                    requestAnimationFrame(() => refs.current[Math.max(0, i - 1)]?.focus());
                  }
                }}
              />
              <div className="step-actions">
                <Button icon size="sm" variant="ghost" title="Outdent" disabled={s.depth === 0} onClick={() => setDepth(i, s.depth - 1)}>
                  {I.outdent({ size: 14 })}
                </Button>
                <Button icon size="sm" variant="ghost" title="Indent" disabled={s.depth >= 3} onClick={() => setDepth(i, s.depth + 1)}>
                  {I.indent({ size: 14 })}
                </Button>
                <Button icon size="sm" variant="ghost" className="del" title="Remove" onClick={() => remove(i)}>
                  {I.trash({ size: 13 })}
                </Button>
              </div>
            </div>
          </Fragment>
        ))}
        {drag !== null && dropIdx === steps.length && <div className="drop-line" style={{ marginLeft: dropDepth * 22 }} />}
      </div>
      <button className="add-item" onClick={() => addAfter(steps.length - 1)}>
        {I.plus({ size: 14 })} Add step
      </button>
    </div>
  );
}
