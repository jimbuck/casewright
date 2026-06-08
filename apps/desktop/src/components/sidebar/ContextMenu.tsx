import { useLayoutEffect, useRef, useState } from 'react';
import type { MenuItem } from '@/components/ui/dropdown-menu';

export type { MenuItem };

export interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

/** Desktop-style right-click menu (NW.js idioms: Reveal in File Explorer, Open in editor…). */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y, ready: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - r.width - 8),
      y: Math.min(y, window.innerHeight - r.height - 8),
      ready: true,
    });
  }, [x, y]);

  return (
    <>
      <div
        className="ctx-scrim"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={ref}
        className="ctx-menu"
        style={{ left: pos.x, top: pos.y, visibility: pos.ready ? 'visible' : 'hidden' }}
      >
        {items.map((it, i) =>
          it.sep ? (
            <div key={i} className="ctx-sep" />
          ) : (
            <button
              key={i}
              className={'ctx-item' + (it.danger ? ' danger' : '')}
              onClick={() => {
                onClose();
                it.on?.();
              }}
            >
              <span className="ctx-ico">{it.icon ? it.icon({ size: 15 }) : null}</span>
              <span className="ctx-label">{it.label}</span>
              {it.sub && <span className="ctx-sub">{it.sub}</span>}
              {it.desktop && (
                <span className="ctx-native" title="Native desktop action">
                  ↗
                </span>
              )}
            </button>
          ),
        )}
      </div>
    </>
  );
}
