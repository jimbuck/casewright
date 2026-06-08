import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { cx } from '@/utils/cx';

export interface ModalProps {
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  maxWidth?: number;
  /** Allow clicking the backdrop to close (default true). */
  dismissable?: boolean;
}

/** Centered modal over a scrim. Clicking the backdrop closes it (unless dismissable=false). */
export function Modal({ onClose, children, className, maxWidth, dismissable = true }: ModalProps) {
  const onScrim = dismissable ? onClose : undefined;
  const stop = (e: MouseEvent) => e.stopPropagation();
  const style: CSSProperties | undefined = maxWidth ? { maxWidth } : undefined;
  return (
    <div className="scrim" onClick={onScrim}>
      <div className={cx('modal', className)} style={style} onClick={stop}>
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ children }: { children: ReactNode }) {
  return <div className="modal-head">{children}</div>;
}

export function ModalBody({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cx('modal-body', className)} style={style}>
      {children}
    </div>
  );
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="modal-foot">{children}</div>;
}
