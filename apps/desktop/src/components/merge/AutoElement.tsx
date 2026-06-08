import type { ReactNode } from 'react';
import { I } from '@/components/icons';
import type { MergeElement } from '@/types';

/** An auto-merged element — collapsed and reassuring. */
export function AutoElement({ el }: { el: MergeElement }) {
  let summary: ReactNode;
  if (el.kind === 'tags') {
    summary = (
      <span>
        {(el.merged || el.theirs).map((t) => (
          <span key={t} className="tag" style={{ marginRight: 5 }}>
            #{t}
          </span>
        ))}
      </span>
    );
  } else if (el.auto === 'same') {
    summary = <span className="muted">unchanged on both sides</span>;
  } else if (el.kind === 'list') {
    const v = el.auto === 'ours' ? el.ours : el.theirs;
    summary = <span>{v.join(' · ')}</span>;
  } else if (el.kind === 'steps') {
    const v = el.auto === 'ours' ? el.ours : el.theirs;
    summary = <span className="mono">{v.map((s) => s.text).join(' → ')}</span>;
  } else {
    const v = el.auto === 'ours' ? el.ours : el.theirs;
    summary = <span>{v}</span>;
  }
  return (
    <div className="elem is-auto">
      <div className="elem-h">
        <span className="eh-name">{el.label}</span>
        <span className="eh-mark">{el.kind === 'field' ? 'front-matter' : '## ' + el.label}</span>
        <span className="eh-status">
          <span className="chip-auto">{I.check({ size: 12 })} auto-merged</span>
        </span>
      </div>
      <div className="elem-auto-body">
        {summary}
        {el.reason && <div className="reason">{el.reason}</div>}
      </div>
    </div>
  );
}
