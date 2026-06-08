import { I } from '@/components/icons';
import type { MergeFile, Resolutions, Resolution } from '@/types';
import { AutoElement } from './AutoElement';
import { ConflictElement } from './ConflictElement';
import { CsvRowConflict } from './CsvRowConflict';

export interface FileDetailProps {
  file: MergeFile;
  resolutions: Resolutions;
  setRes: (key: string, value: Resolution) => void;
}

export function FileDetail({ file, resolutions, setRes }: FileDetailProps) {
  if (file.kind === 'run') {
    const autoRows = file.rows.filter((r) => !r.conflict);
    return (
      <div className="merge-detail">
        <div className="md-file-h">
          <h4>{file.title}</h4>
        </div>
        <div className="fp" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)', marginBottom: 14 }}>
          {file.path}
        </div>
        <div className="md-auto-note">
          {I.check({ size: 14 })} {autoRows.length} row(s) auto-merged by <span className="mono">case_id</span> — only diverging
          rows need a choice.
        </div>
        {file.rows.map((r, i) =>
          r.conflict ? (
            <CsvRowConflict
              key={i}
              row={r}
              resKey={file.path + '::' + r.case_id}
              res={resolutions[file.path + '::' + r.case_id]}
              setRes={setRes}
            />
          ) : (
            <div key={i} className="elem is-auto">
              <div className="elem-h">
                <span className="eh-name">
                  <span className="mono">{r.display_id}</span>
                </span>
                <span className="eh-status">
                  <span className="chip-auto">
                    {I.check({ size: 12 })} {r.auto === 'same' ? 'unchanged' : 'auto-merged'}
                  </span>
                </span>
              </div>
              {r.reason && (
                <div className="elem-auto-body">
                  <div className="reason">{r.reason}</div>
                </div>
              )}
            </div>
          ),
        )}
      </div>
    );
  }

  const conflicts = file.elements.filter((e) => e.conflict);
  const autos = file.elements.filter((e) => !e.conflict);
  return (
    <div className="merge-detail">
      <div className="md-file-h">
        <span className="fp">{file.displayId}</span>
        <h4>{file.title}</h4>
      </div>
      <div className="fp" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)', marginBottom: 14 }}>
        {file.path}
      </div>
      <div className="md-auto-note">
        {I.check({ size: 14 })} {autos.length} element(s) auto-merged — {conflicts.length} need your decision.
      </div>
      {file.elements.map((el, i) =>
        el.conflict ? (
          <ConflictElement
            key={i}
            el={el}
            resKey={file.path + '::' + el.key}
            res={resolutions[file.path + '::' + el.key]}
            setRes={setRes}
          />
        ) : (
          <AutoElement key={i} el={el} />
        ),
      )}
    </div>
  );
}
