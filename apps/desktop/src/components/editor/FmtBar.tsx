import type { RefObject } from 'react';
import { I } from '@/components/icons';
import { wrapSelection } from '@/utils/markdown';

export interface FmtBarProps {
  targetRef: RefObject<HTMLTextAreaElement | null>;
  onApply: (value: string) => void;
  hint?: boolean;
}

/** Inline-formatting toolbar for the Objective editor. */
export function FmtBar({ targetRef, onApply, hint = true }: FmtBarProps) {
  const apply = (before: string, after: string) => {
    const el = targetRef.current;
    if (!el) return;
    const r = wrapSelection(el, before, after);
    onApply(r.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.selStart, r.selEnd);
    });
  };
  const prevent = (e: { preventDefault: () => void }) => e.preventDefault();
  return (
    <div className="fmt-bar">
      <button className="fmt-btn" title="Bold" onMouseDown={prevent} onClick={() => apply('**', '**')}>
        {I.bold({ size: 15 })}
      </button>
      <button className="fmt-btn" title="Italic" onMouseDown={prevent} onClick={() => apply('*', '*')}>
        {I.italic({ size: 15 })}
      </button>
      <button className="fmt-btn" title="Strikethrough" onMouseDown={prevent} onClick={() => apply('~~', '~~')}>
        {I.strike({ size: 15 })}
      </button>
      <span className="fmt-sep" />
      <button className="fmt-btn" title="Inline code" onMouseDown={prevent} onClick={() => apply('`', '`')}>
        {I.code({ size: 15 })}
      </button>
      <button className="fmt-btn" title="Link" onMouseDown={prevent} onClick={() => apply('[', '](https://)')}>
        {I.link({ size: 15 })}
      </button>
      {hint && <span className="fmt-hint">inline only — bold, italic, strike, code, links</span>}
    </div>
  );
}
