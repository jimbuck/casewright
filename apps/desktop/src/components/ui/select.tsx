import type { SelectHTMLAttributes } from 'react';
import { cx } from '@/utils/cx';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...rest }: SelectProps) {
  return (
    <select className={cx('select', className)} {...rest}>
      {children}
    </select>
  );
}
