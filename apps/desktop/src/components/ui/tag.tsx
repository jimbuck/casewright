import type { HTMLAttributes } from 'react';
import { cx } from '@/utils/cx';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  accent?: boolean;
}

export function Tag({ accent, className, children, ...rest }: TagProps) {
  return (
    <span className={cx('tag', accent && 'accent', className)} {...rest}>
      {children}
    </span>
  );
}
