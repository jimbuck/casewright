import * as React from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import type { MenuItem } from './dropdown-menu';
import { cn } from '@/lib/utils';

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

export const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      ref={ref}
      className={cn(
        'z-[71] min-w-[210px] rounded-md border border-border-2 bg-panel p-[5px] shadow-[0_12px_34px_oklch(0.3_0.02_70/0.28),0_2px_6px_oklch(0.3_0.02_70/0.16)] animate-[ctxin_0.1s_ease]',
        className,
      )}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
));
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName;

/**
 * A right-click context menu built from a list of `MenuItem`s, wrapping `children`
 * as the trigger. Reproduces the old `.ctx-menu` look.
 */
export function RowContextMenu({ items, children }: { items: MenuItem[]; children: React.ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {items.map((it, i) =>
          it.sep ? (
            <ContextMenuPrimitive.Separator key={i} className="mx-1.5 my-1 h-px bg-border" />
          ) : (
            <ContextMenuPrimitive.Item
              key={i}
              onSelect={() => it.on?.()}
              className={cn(
                'group flex w-full cursor-pointer items-center gap-[9px] rounded-sm px-[9px] py-1.5 text-left text-[12.5px] outline-none',
                it.danger
                  ? 'text-fail data-[highlighted]:bg-fail-soft data-[highlighted]:text-fail'
                  : 'text-ink data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent-ink',
              )}
            >
              {it.icon && (
                <span
                  className={cn(
                    'grid shrink-0 place-items-center',
                    it.danger ? 'text-fail' : 'text-ink-3 group-data-[highlighted]:text-accent-ink',
                  )}
                >
                  {it.icon({ size: 15 })}
                </span>
              )}
              <span className="flex-1">{it.label}</span>
              {it.sub && (
                <span className="max-w-24 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px] text-ink-faint">
                  {it.sub}
                </span>
              )}
              {it.desktop && (
                <span className="text-[11px] text-ink-faint" title="Native desktop action">
                  ↗
                </span>
              )}
            </ContextMenuPrimitive.Item>
          ),
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
