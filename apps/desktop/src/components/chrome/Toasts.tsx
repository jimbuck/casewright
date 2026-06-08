import { I } from '@/components/icons';
import { useApp } from '@/store/app-context';

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className="toast ok">
          <span className="tt-icon">{I.check({ size: 15 })}</span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
