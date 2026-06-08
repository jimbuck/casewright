import type { InputHTMLAttributes } from 'react';
import { cx } from '@/utils/cx';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
}

export function Input({ mono, className, ...rest }: InputProps) {
  return <input className={cx('input', mono && 'mono', className)} {...rest} />;
}
