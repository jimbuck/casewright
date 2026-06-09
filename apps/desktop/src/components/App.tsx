import { useApp } from '@/store/app-store';
import { I } from './icons';
import { Button } from './ui';
import { TitleBar } from './chrome/TitleBar';
import { TopBar } from './chrome/TopBar';
import { Toasts } from './chrome/Toasts';
import { Launcher } from './launcher/Launcher';
import { Sidebar } from './sidebar/Sidebar';
import { CaseEditor } from './editor/CaseEditor';
import { RunsList } from './runs/RunsList';
import { RunGrid } from './runs/RunGrid';
import { RunGuide } from './guide/RunGuide';
import { CreateRunModal } from './runs/CreateRunModal';
import { CommitModal } from './common/CommitModal';
import { WorkspaceModal } from './common/WorkspaceModal';
import { EmptyCenter } from './common/EmptyCenter';
import { MergeResolver } from './merge/MergeResolver';
import { SuiteSummary } from './summary/SuiteSummary';

function Center() {
  const { view, sel } = useApp();
  if (view === 'suite') return <SuiteSummary />;
  if (view === 'runs') return <RunsList />;
  if (view === 'guide') return <RunGuide />;
  if (view === 'run') return <RunGrid />;
  if (sel.id) return <CaseEditor />;
  return <EmptyCenter />;
}

function Workbench() {
  const { screen, modal, workspace, mergeBanner, abortMerge } = useApp();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-panel">
      <TitleBar />
      {screen === 'launcher' || !workspace ? (
        <Launcher />
      ) : (
        <>
          <TopBar />
          {mergeBanner && (
            <div className="flex items-center gap-3 border-b border-[oklch(0.85_0.07_80)] bg-blocked-soft px-4 py-2 text-[12.5px] text-[oklch(0.5_0.12_66)]">
              <span className="shrink-0">{I.warn({ size: 14 })}</span>
              <span className="flex-1">{mergeBanner}</span>
              <Button size="sm" className="shrink-0" onClick={() => void abortMerge()}>
                Abort merge
              </Button>
            </div>
          )}
          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 flex-1">
              <Sidebar />
              <Center />
            </div>
          </div>
          {modal === 'commit' && <CommitModal />}
          {modal === 'workspace' && <WorkspaceModal />}
          {modal === 'createRun' && <CreateRunModal />}
          {modal === 'merge' && <MergeResolver />}
          <Toasts />
        </>
      )}
    </div>
  );
}

export function App() {
  return <Workbench />;
}
