import { useRef, useState } from 'react';
import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { hasBlockConstructs, renderInline, sanitizeInline } from '@/utils/markdown';
import { FmtBar } from './FmtBar';

export interface ObjectiveEditorProps {
  value: string;
  onChange: (value: string) => void;
}

/** Objective — the editorial reading surface (sans-serif editor + inline preview). */
export function ObjectiveEditor({ value, onChange }: ObjectiveEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const blocked = hasBlockConstructs(value);
  return (
    <div className="section">
      <div className="section-h">
        <span className="ricon2" style={{ color: 'var(--ink-3)' }}>
          {I.edit({ size: 15 })}
        </span>
        <span className="sh-title">Objective</span>
        <span className="sh-mark">## Objective</span>
        <span className="sh-spacer" />
        <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
          {preview ? I.edit({ size: 13 }) : I.eye({ size: 13 })} {preview ? 'Edit' : 'Preview'}
        </Button>
      </div>
      <div className="objective-wrap">
        {!preview && <FmtBar targetRef={ref} onApply={onChange} />}
        {preview ? (
          <div className="objective-preview">
            {renderInline(value, 'obj') || <span className="muted">No objective yet.</span>}
          </div>
        ) : (
          <textarea
            ref={ref}
            className="objective"
            value={value}
            placeholder="Describe what this case verifies, and why it matters…"
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        {blocked && (
          <div className="block-warn">
            {I.warn({ size: 14 })}
            <span>Block-level markdown isn't allowed in fields — only inline formatting.</span>
            <Button size="sm" style={{ marginLeft: 'auto' }} onClick={() => onChange(sanitizeInline(value))}>
              Clean up
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
