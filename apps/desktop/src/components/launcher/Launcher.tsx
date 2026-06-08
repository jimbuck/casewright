import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { recents } from '@/data/sample';
import { useApp } from '@/store/app-context';

export function Launcher() {
  const { openRepo } = useApp();
  return (
    <div className="launch">
      <div className="launch-hero">
        <div className="mark">
          <div className="glyph">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5h11l5 5v9H4z" />
              <path d="M15 5v5h5" />
              <path d="M8 13h7M8 16h5" />
            </svg>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'oklch(0.78 0.02 256)', letterSpacing: '0.04em' }}>
            casewright
          </span>
        </div>
        <h1>Casewright</h1>
        <p className="tag-line">A craftsman's editor for manual test cases — markdown on disk, Git as the data store.</p>
        <div className="sub">
          <div>{I.repo({ size: 14 })} cases as plain markdown</div>
          <div>{I.layers({ size: 14 })} suites are just folders</div>
          <div>{I.merge({ size: 14 })} structured 3-way merge</div>
        </div>
        <div className="brandfoot">v1 · local-first · no telemetry</div>
      </div>

      <div className="launch-main">
        <h2>Open a repository</h2>
        <div className="launch-actions">
          <Button variant="primary" onClick={openRepo}>
            {I.folderOpen({ size: 15 })} Open repository…
          </Button>
          <Button onClick={openRepo}>{I.plus({ size: 15 })} Clone from Azure DevOps</Button>
        </div>
        <div className="tree-section-h" style={{ padding: '0 2px 8px' }}>
          <span>Recent</span>
        </div>
        <div className="recents-list">
          {recents.map((r, i) => (
            <button key={i} className="recent" onClick={openRepo}>
              <div className="ricon">{I.repo({ size: 17 })}</div>
              <div className="rmid">
                <div className="rname">
                  {r.name}
                  {r.current && <span className="badge-open">open</span>}
                </div>
                <div className="rpath">{r.path}</div>
              </div>
              <div className="rmeta">
                <div className="rbranch">
                  {I.branch({ size: 12 })} {r.branch}
                </div>
                <div style={{ marginTop: 4 }}>
                  {r.workspaces} workspaces · {r.lastOpened}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
