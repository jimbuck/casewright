import { useState } from 'react';
import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { conflict } from '@/data/sample';
import { useApp } from '@/store/app-context';
import type { Resolution, Resolutions } from '@/types';
import { FileDetail } from './FileDetail';

/** Root structured 3-way merge resolver (the showpiece). */
export function MergeResolver() {
  const { completeMerge, setModal } = useApp();
  const cancel = () => setModal(null);
  const [active, setActive] = useState(0);
  const [resolutions, setResolutions] = useState<Resolutions>({});
  const setRes = (k: string, v: Resolution) => setResolutions((s) => ({ ...s, [k]: v }));

  // count conflicts per file + how many are resolved
  const fileStats = conflict.files.map((f) => {
    const keys =
      f.kind === 'run'
        ? f.rows.filter((r) => r.conflict).map((r) => f.path + '::' + r.case_id)
        : f.elements.filter((e) => e.conflict).map((e) => f.path + '::' + e.key);
    const resolved = keys.filter((k) => resolutions[k]).length;
    return { total: keys.length, resolved };
  });
  const totalConflicts = fileStats.reduce((a, s) => a + s.total, 0);
  const totalResolved = fileStats.reduce((a, s) => a + s.resolved, 0);
  const done = totalResolved === totalConflicts;

  return (
    <div className="scrim">
      <div className="modal merge-modal" onClick={(e) => e.stopPropagation()}>
        <div className="merge-head">
          <div className="mh-icon">{I.merge({ size: 20 })}</div>
          <div>
            <h3>
              Resolve merge — pull from <span className="mono">origin/{conflict.branch}</span>
            </h3>
            <div className="mh-sub">Structured 3-way merge · non-conflicting changes already merged automatically</div>
          </div>
          <div className="merge-progress">
            <span>
              {totalResolved} / {totalConflicts} conflicts
            </span>
            <div className="mp-bar">
              <i style={{ width: (totalConflicts ? (totalResolved / totalConflicts) * 100 : 100) + '%' }} />
            </div>
          </div>
        </div>

        <div className="merge-body">
          <div className="merge-files">
            <div className="mf-group-h">Conflicted files · {conflict.files.length}</div>
            {conflict.files.map((f, i) => {
              const st = fileStats[i];
              const resolved = st.resolved === st.total;
              return (
                <div key={i} className={'mf-file' + (active === i ? ' sel' : '')} onClick={() => setActive(i)}>
                  <div className="mf-name">
                    <span className={'mf-state ' + (resolved ? 'resolved' : 'pending')} />
                    <span className="ricon2" style={{ color: 'var(--ink-faint)' }}>
                      {f.kind === 'run' ? I.grid({ size: 13 }) : I.file({ size: 13 })}
                    </span>
                    <span className="ft">{f.path.split('/').pop()}</span>
                    <span className={'mf-badge ' + (resolved ? 'resolved' : 'pending')}>
                      {resolved ? 'done' : st.resolved + '/' + st.total}
                    </span>
                  </div>
                  <div className="mf-path">{f.path.replace(/\/[^/]+$/, '')}</div>
                </div>
              );
            })}
          </div>
          <FileDetail file={conflict.files[active]} resolutions={resolutions} setRes={setRes} />
        </div>

        <div className="merge-foot">
          <span className="mf-status">
            {done ? (
              <span style={{ color: 'var(--pass)', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                {I.check({ size: 14 })} All conflicts resolved
              </span>
            ) : (
              <>
                {I.warn({ size: 14 })} {totalConflicts - totalResolved} conflict(s) remaining
              </>
            )}
          </span>
          <span className="spacer" />
          <Button variant="ghost" onClick={cancel}>
            Abort merge
          </Button>
          <Button onClick={cancel} title="Hand-edit raw markdown / CSV">
            {I.code({ size: 14 })} Raw view
          </Button>
          <Button variant="primary" disabled={!done} onClick={() => completeMerge(resolutions)}>
            {I.merge({ size: 14 })} Complete merge
          </Button>
        </div>
      </div>
    </div>
  );
}
