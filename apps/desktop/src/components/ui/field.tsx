import type { CSSProperties, ReactNode } from 'react';
import { cx } from '@/utils/cx';

export interface FieldProps {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Labeled form field (uppercase label above its control). */
export function Field({ label, children, className, style }: FieldProps) {
  return (
    <div className={cx('field', className)} style={style}>
      {label != null && <label>{label}</label>}
      {children}
    </div>
  );
}
