import { Fragment, useRef, useState, type ReactNode } from 'react';
import { I } from '@/components/icons';
import { Button } from '@/components/ui';

export interface ListControlProps {
  icon: ReactNode;
  title: string;
  mark: string;
  marker: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}

/** Generic single-line list control (Systems / Expected) with drag-reorder. */
export function ListControl({ icon, title, mark, marker, items, onChange, placeholder }: ListControlProps) {
  const refs = useRef<Record<number, HTMLInputElement | null>>({});
  const [drag, setDrag] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const setItem = (i: number, v: string) => onChange(items.map((x, j) => (j === i ? v : x)));
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const add = () => {
    onChange([...items, '']);
    requestAnimationFrame(() => refs.current[items.length]?.focus());
  };
  const rowOver = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const before = e.clientY - r.top < r.height / 2;
    setDropIdx(before ? i : i + 1);
  };
  const doDrop = (e?: React.DragEvent) => {
    if (e) e.preventDefault();
    if (drag !== null && dropIdx !== null) {
      let at = dropIdx;
      if (drag < dropIdx) at -= 1;
      const next = items.slice();
      const [x] = next.splice(drag, 1);
      next.splice(at, 0, x);
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
          {icon}
        </span>
        <span className="sh-title">{title}</span>
        <span className="sh-mark">{mark}</span>
      </div>
      <div className="item-list compact" onDragOver={(e) => e.preventDefault()} onDrop={() => doDrop()}>
        {items.map((it, i) => (
          <Fragment key={i}>
            {drag !== null && dropIdx === i && <div className="drop-line" />}
            <div className={'litem' + (drag === i ? ' dragging' : '')} onDragOver={rowOver(i)} onDrop={doDrop}>
              <span className="grip" draggable onDragStart={() => setDrag(i)} onDragEnd={endDrag}>
                {I.drag({ size: 14 })}
              </span>
              <span className="bullet">{marker}</span>
              <input
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className="li-input"
                value={it}
                placeholder={placeholder}
                onChange={(e) => setItem(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onChange([...items.slice(0, i + 1), '', ...items.slice(i + 1)]);
                    requestAnimationFrame(() => refs.current[i + 1]?.focus());
                  }
                  if (e.key === 'Backspace' && it === '' && items.length > 1) {
                    e.preventDefault();
                    remove(i);
                    requestAnimationFrame(() => refs.current[Math.max(0, i - 1)]?.focus());
                  }
                }}
              />
              <Button icon size="sm" variant="ghost" className="li-del" title="Remove" onClick={() => remove(i)}>
                {I.trash({ size: 13 })}
              </Button>
            </div>
          </Fragment>
        ))}
        {drag !== null && dropIdx === items.length && <div className="drop-line" />}
      </div>
      <button className="add-item" onClick={add}>
        {I.plus({ size: 14 })} Add item
      </button>
    </div>
  );
}
