import { I } from '@/components/icons';
import { Button, ResultSwatch } from '@/components/ui';
import type { CsvMergeRow, Resolution, RunRowValue } from '@/types';

export interface CsvRowConflictProps {
  row: CsvMergeRow;
  resKey: string;
  res?: Resolution;
  setRes: (key: string, value: Resolution) => void;
}

/** A diverging CSV result row — pick which tester's recording wins. */
export function CsvRowConflict({ row, resKey, res, setRes }: CsvRowConflictProps) {
  const choice = res?.choice;

  const renderSide = (side: 'ours' | 'theirs', data: RunRowValue, label: string, who: string) => (
    <div className={'side ' + side + (choice === side ? ' chosen' : '')}>
      <div className="side-h">
        <span className="lbl">{label}</span>
        <span className="who">{who}</span>
        <span className="side-take">
          <Button size="sm" onClick={() => setRes(resKey, { choice: side })}>
            {choice === side ? I.check({ size: 12 }) : null} Take {side === 'ours' ? 'yours' : 'theirs'}
          </Button>
        </span>
      </div>
      <div className="csv-row-grid">
        <span className="k">result</span>
        <ResultSwatch value={data.result} />
        <span className="k">tester</span>
        <span className="mono">{data.tester || '—'}</span>
        <span className="k">notes</span>
        <span>{data.notes || <span className="muted">—</span>}</span>
      </div>
    </div>
  );

  return (
    <div className="elem is-conflict">
      <div className="elem-h">
        <span className="eh-name">
          <span className="mono">{row.display_id}</span> — result row
        </span>
        <span className="eh-mark">case_id {row.case_id}</span>
        <span className="eh-status">
          {choice ? (
            <span className="chip-resolved">
              {I.check({ size: 12 })} {choice === 'ours' ? 'kept yours' : 'kept theirs'}
            </span>
          ) : (
            <span className="chip-conflict">{I.warn({ size: 12 })} conflict</span>
          )}
        </span>
      </div>
      <div className="sides">
        {renderSide('ours', row.ours!, 'Yours', 'stage :2 · local')}
        {renderSide('theirs', row.theirs!, 'Theirs', 'stage :3 · incoming')}
      </div>
      <div className="base-ref">
        <div className="br-h">{I.clock({ size: 12 })} Base</div>
        <ResultSwatch value={row.base!.result} />
      </div>
    </div>
  );
}
