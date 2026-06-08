import type { CSSProperties, ReactNode } from 'react';
import { I } from '@/components/icons';
import { cn } from '@/lib/utils';

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
    <button
      className="flex w-full items-start gap-[11px] rounded-md border border-transparent bg-transparent px-[11px] py-[9px] text-left transition-colors hover:bg-raise"
      onClick={onToggle}
      style={style}
    >
      {checked ? (
        <span className="mt-px grid size-5 shrink-0 place-items-center rounded-[5px] border-[1.5px] border-[#3a6fc0] bg-[#3a6fc0] text-white transition">
          {I.check({ size: 13 })}
        </span>
      ) : (
        <span className="mt-px grid size-5 shrink-0 place-items-center rounded-[5px] border-[1.5px] border-border-2 bg-panel text-white transition" />
      )}
      {num != null && (
        <span className={cn('mt-px min-w-[26px] shrink-0 font-mono text-[13px] font-semibold', checked ? 'text-ink-faint' : 'text-accent-ink')}>
          {num}
        </span>
      )}
      <span className={cn('pt-px text-[14.5px] leading-[1.5]', checked ? 'text-ink-3' : 'text-ink')}>{children}</span>
    </button>
  );
}
