import type { ButtonHTMLAttributes } from 'react';
import { cx } from '@/utils/cx';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';
export type ButtonSize = 'default' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square icon-only button. */
  icon?: boolean;
}

/**
 * The base button. Maps the prototype's `.btn` modifier classes to props:
 *   <Button variant="primary">      → .btn.primary
 *   <Button variant="ghost" size="sm" icon> → .btn.ghost.sm.icon
 */
export function Button({
  variant = 'default',
  size = 'default',
  icon = false,
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('btn', variant !== 'default' && variant, size === 'sm' && 'sm', icon && 'icon', className)}
      {...rest}
    />
  );
}
