import type { TextareaHTMLAttributes } from 'react';
import { cx } from '@/utils/cx';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...rest }: TextareaProps) {
  return <textarea className={cx('textarea', className)} {...rest} />;
}
