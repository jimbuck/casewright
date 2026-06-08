import { I } from '@/components/icons';

export function TitleBar({ subtitle }: { subtitle?: string }) {
  return (
    <div className="titlebar">
      <div className="traffic">
        <i className="r" />
        <i className="y" />
        <i className="g" />
      </div>
      <div className="wintitle">
        {I.repo({ size: 13 })}
        <b>Casewright</b>
        {subtitle ? ' — ' + subtitle : ''}
      </div>
    </div>
  );
}
