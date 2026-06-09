import type { CSSProperties, ReactNode } from 'react';
import { I } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { CheckState } from '@/types';

export interface GuideCheckProps {
  state: CheckState;
  /** Cycle the state: none → pass → fail → none. */
  onToggle: () => void;
  children: ReactNode;
  num?: string | null;
  depth?: number;
}

export function GuideCheck({ state, onToggle, children, num, depth }: GuideCheckProps) {
  const style: CSSProperties | undefined = depth ? { marginLeft: depth * 26 } : undefined;
  const box =
    state === 'pass' ? (
      <span className="mt-px grid size-5 shrink-0 place-items-center rounded-[5px] border-[1.5px] border-[#3a6fc0] bg-[#3a6fc0] text-white transition">
        {I.check({ size: 13 })}
      </span>
    ) : state === 'fail' ? (
      <span className="mt-px grid size-5 shrink-0 place-items-center rounded-[5px] border-[1.5px] border-fail bg-fail text-white transition">
        {I.x({ size: 12 })}
      </span>
    ) : (
      <span className="mt-px grid size-5 shrink-0 place-items-center rounded-[5px] border-[1.5px] border-border-2 bg-panel transition" />
    );
  const done = state !== 'none';
  return (
    <button
      className="flex w-full items-start gap-[11px] rounded-md border border-transparent bg-transparent px-[11px] py-[9px] text-left transition-colors hover:bg-raise"
      onClick={onToggle}
      style={style}
      title="Click to cycle: empty → passed → failed"
    >
      {box}
      {num != null && (
        <span className={cn('mt-px min-w-[26px] shrink-0 font-mono text-[13px] font-semibold', done ? 'text-ink-faint' : 'text-accent-ink')}>{num}</span>
      )}
      <span className={cn('pt-px text-[14.5px] leading-[1.5]', state === 'fail' ? 'text-fail' : done ? 'text-ink-3' : 'text-ink')}>{children}</span>
    </button>
  );
}
