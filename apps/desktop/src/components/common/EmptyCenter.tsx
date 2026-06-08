import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { useApp } from '@/store/app-store';

export function EmptyCenter() {
  const { createCase } = useApp();
  return (
    <div className="center">
      <div className="empty-center">
        <div className="ec-inner">
          {I.file({ size: 30, style: { color: 'var(--ink-faint)' } })}
          <div style={{ fontSize: 14, color: 'var(--ink-3)' }}>
            Select a case from the tree, or create a new one.
          </div>
          <Button variant="primary" onClick={() => createCase(null)}>
            {I.plus({ size: 14 })} New case
          </Button>
        </div>
      </div>
    </div>
  );
}
