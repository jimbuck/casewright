import { useState } from 'react';
import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { useApp } from '@/store/app-store';

export function TopBar() {
  const { workspace, workspaces, branch, ahead, behind, changes, setWorkspace, goHome, doPush, doPull, setModal, toast } =
    useApp();
  const [wsOpen, setWsOpen] = useState(false);
  const dirty = changes.length;

  return (
    <div className="topbar">
      <Button variant="ghost" icon title="Repositories" onClick={goHome}>
        {I.repo({ size: 16 })}
      </Button>

      <div className="crumb" style={{ position: 'relative' }}>
        <div className="ws-switch" onClick={() => setWsOpen(!wsOpen)}>
          <span className="repo-glyph">
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5h11l5 5v9H4z" />
              <path d="M15 5v5h5" />
            </svg>
          </span>
          <span className="ws-repo">qa-testcases /</span>
          <span className="ws-name">
            <b>{workspace.name}</b>
          </span>
          {I.chevronDown({ size: 13 })}
        </div>
        {wsOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 20 }} onClick={() => setWsOpen(false)} />
            <div className="res-pop" style={{ top: 40, left: 0, zIndex: 30, minWidth: 240 }}>
              <div className="mf-group-h">Workspaces · casewright.json</div>
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  className="res-opt"
                  onClick={() => {
                    setWorkspace(w);
                    setWsOpen(false);
                    toast('Switched to ' + w.name);
                  }}
                >
                  {I.folder({ size: 14 })}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{w.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                      {w.path}
                    </div>
                  </div>
                  {w.id === workspace.id && <span style={{ color: 'var(--accent)' }}>{I.check({ size: 13 })}</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <span className="branch-chip">
        {I.branch({ size: 13 })}
        {branch}
        {ahead || behind ? (
          <span className={'ab' + (dirty ? ' dirty' : '')}>
            {behind ? <span>↓{behind}</span> : null}
            {ahead ? <span>↑{ahead}</span> : null}
          </span>
        ) : null}
        {dirty ? (
          <span className="ab dirty" title={dirty + ' uncommitted file(s)'}>
            <span className="dirty-dot" />
            {dirty}
          </span>
        ) : null}
      </span>

      <div className="git-actions">
        <Button onClick={doPull}>
          {I.pull({ size: 15 })}Pull{behind ? <span className="count-pill warn">{behind}</span> : null}
        </Button>
        <Button onClick={() => setModal('commit')}>
          {I.commit({ size: 15 })}Commit{dirty ? <span className="count-pill">{dirty}</span> : null}
        </Button>
        <Button variant="primary" onClick={doPush} disabled={!ahead}>
          {I.push({ size: 15 })}Push
          {ahead ? (
            <span className="count-pill" style={{ background: 'oklch(1 0 0 / 0.22)', color: '#fff' }}>
              {ahead}
            </span>
          ) : null}
        </Button>
      </div>
    </div>
  );
}
