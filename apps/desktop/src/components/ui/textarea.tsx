import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { controlBase } from './input';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...rest }: TextareaProps) {
  return <textarea className={cn(controlBase, className)} {...rest} />;
}
