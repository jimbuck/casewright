import { useApp } from '@/store/app-store';
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
import { EmptyCenter } from './common/EmptyCenter';
import { MergeResolver } from './merge/MergeResolver';

function Center() {
  const { view, sel } = useApp();
  if (view === 'runs') return <RunsList />;
  if (view === 'guide') return <RunGuide />;
  if (view === 'run') return <RunGrid />;
  if (sel.id) return <CaseEditor />;
  return <EmptyCenter />;
}

function Workbench() {
  const { screen, modal } = useApp();

  return (
    <div className="app">
      <TitleBar />
      {screen === 'launcher' ? (
        <Launcher />
      ) : (
        <>
          <TopBar />
          <div className="shell">
            <div className="workspace">
              <Sidebar />
              <Center />
            </div>
          </div>
          {modal === 'commit' && <CommitModal />}
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
