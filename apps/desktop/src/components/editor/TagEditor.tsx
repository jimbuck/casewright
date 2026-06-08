import { useState } from 'react';
import { I } from '@/components/icons';

export interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagEditor({ tags, onChange }: TagEditorProps) {
  const [adding, setAdding] = useState('');
  const commit = () => {
    const t = adding.trim().replace(/^#/, '');
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setAdding('');
  };
  return (
    <div className="tags-edit">
      {tags.map((t) => (
        <span key={t} className="tag-chip">
          <span className="mono" style={{ opacity: 0.6 }}>
            #
          </span>
          {t}
          <button onClick={() => onChange(tags.filter((x) => x !== t))}>{I.x({ size: 11 })}</button>
        </span>
      ))}
      <input
        className="tag-add"
        placeholder="+ tag"
        value={adding}
        onChange={(e) => setAdding(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Backspace' && !adding && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={commit}
      />
    </div>
  );
}
