import type { Status } from '@/types';
import { cx } from '@/utils/cx';

/** Capitalized status pill (Active / Draft / Deprecated). */
export function StatusPill({ status, className }: { status: Status; className?: string }) {
  return (
    <span className={cx('status-pill', `status-${status}`, className)} style={{ textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}
