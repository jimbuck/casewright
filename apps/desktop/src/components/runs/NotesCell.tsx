import { useEffect, useRef, useState } from 'react';
import { renderInline } from '@/utils/markdown';

export interface NotesCellProps {
  value: string;
  onChange: (value: string) => void;
}

/** Multi-line markdown notes cell — rendered when idle, textarea when editing. */
export function NotesCell({ value, onChange }: NotesCellProps) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };
  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      grow(ref.current);
      ref.current.setSelectionRange(value.length, value.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (editing) {
    return (
      <textarea
        ref={ref}
        className="cell-notes-edit"
        value={value}
        rows={1}
        placeholder="Notes — markdown, multi-line"
        onChange={(e) => {
          onChange(e.target.value);
          grow(e.target);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  const lines = (value || '').split('\n');
  return (
    <div className="cell-notes" onClick={() => setEditing(true)} title="Click to edit — markdown supported">
      {value ? (
        lines.map((ln, i) => (
          <div key={i} className="cn-line">
            {ln ? renderInline(ln, 'n' + i) : <br />}
          </div>
        ))
      ) : (
        <span className="muted">—</span>
      )}
    </div>
  );
}
