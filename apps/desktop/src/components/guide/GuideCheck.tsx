import type { CSSProperties, ReactNode } from 'react';
import { I } from '@/components/icons';

export interface GuideCheckProps {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
  num?: string | null;
  depth?: number;
}

export function GuideCheck({ checked, onToggle, children, num, depth }: GuideCheckProps) {
  const style: CSSProperties | undefined = depth ? { marginLeft: depth * 26 } : undefined;
  return (
    <button className={'gcheck' + (checked ? ' on' : '')} onClick={onToggle} style={style}>
      {checked ? (
        <span key="on" className="gcheck-box gcheck-box--on">
          {I.check({ size: 13 })}
        </span>
      ) : (
        <span key="off" className="gcheck-box gcheck-box--off" />
      )}
      {num != null && <span className="gcheck-num">{num}</span>}
      <span className="gcheck-text">{children}</span>
    </button>
  );
}
