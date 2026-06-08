import { useEffect, useState, type MouseEvent } from 'react';
import { I } from '@/components/icons';
import { ContextMenu, type MenuItem } from '@/components/sidebar/ContextMenu';
import { nwWindow } from '@/lib/nwjs';
import { useApp } from '@/store/app-context';

/* window-control glyphs (VS Code / Windows style) */
const wcProps = { viewBox: '0 0 10 10', width: 10, height: 10, fill: 'none', stroke: 'currentColor', strokeWidth: 1.1 } as const;
const WinMin = () => (
  <svg {...wcProps}>
    <path d="M1 5h8" />
  </svg>
);
const WinMax = () => (
  <svg {...wcProps}>
    <rect x="1.2" y="1.2" width="7.6" height="7.6" />
  </svg>
);
const WinRestore = () => (
  <svg {...wcProps}>
    <path d="M3 3.3V1.2h5.5v5.5H6.6" />
    <rect x="1.3" y="3.3" width="5.4" height="5.4" />
  </svg>
);
const WinClose = () => (
  <svg {...wcProps}>
    <path d="M1.3 1.3l7.4 7.4M8.7 1.3L1.3 8.7" />
  </svg>
);

interface OpenMenu {
  x: number;
  y: number;
  items: MenuItem[];
}

export function TitleBar() {
  const ctx = useApp();
  const { screen } = ctx;
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const [maximized, setMaximized] = useState(false);

  // keep the maximize/restore glyph in sync with the real window state
  useEffect(() => {
    const win = nwWindow();
    if (!win) return;
    const onMax = () => setMaximized(true);
    const onRestore = () => setMaximized(false);
    win.on('maximize', onMax);
    win.on('unmaximize', onRestore);
    win.on('restore', onRestore);
    return () => {
      win.removeAllListeners('maximize');
      win.removeAllListeners('unmaximize');
      win.removeAllListeners('restore');
    };
  }, []);

  const minimize = () => nwWindow()?.minimize();
  const close = () => nwWindow()?.close();
  const toggleMax = () => {
    const win = nwWindow();
    if (!win) {
      setMaximized((m) => !m);
      return;
    }
    if (maximized) win.unmaximize();
    else win.maximize();
  };

  const openMenu = (e: MouseEvent<HTMLButtonElement>, items: MenuItem[]) => {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom, items });
  };

  const menus: { label: string; items: MenuItem[] }[] = [
    {
      label: 'File',
      items: [
        { icon: I.file, label: 'New Case', on: () => ctx.createCase(null) },
        { icon: I.folder, label: 'New Suite', on: () => ctx.createSuite(null) },
        { sep: true },
        { icon: I.commit, label: 'Commit…', on: () => ctx.setModal('commit') },
        { sep: true },
        { icon: I.x, label: 'Exit', on: () => nwWindow()?.close() },
      ],
    },
    {
      label: 'View',
      items: [
        { icon: I.layers, label: 'Cases', on: () => ctx.sel.id && ctx.openCase(ctx.sel.id) },
        { icon: I.grid, label: 'Runs', on: () => ctx.openRunsList() },
        { sep: true },
        { icon: I.sync, label: 'Reload', on: () => nwWindow()?.reload() },
        { icon: I.code, label: 'Toggle Developer Tools', on: () => nwWindow()?.showDevTools?.() },
      ],
    },
    {
      label: 'Go',
      items: [
        { icon: I.pull, label: 'Pull', on: () => ctx.doPull() },
        { icon: I.push, label: 'Push', on: () => ctx.doPush() },
        { sep: true },
        { icon: I.repo, label: 'Repositories', on: () => ctx.goHome() },
      ],
    },
    {
      label: 'Help',
      items: [
        { icon: I.eye, label: 'About Casewright', sub: 'v1', on: () => ctx.toast('Casewright v1 · local-first · no telemetry') },
        { icon: I.link, label: 'Documentation', on: () => ctx.toast('Docs — coming soon') },
      ],
    },
  ];

  const title = screen === 'main' ? `${ctx.workspace.name} — Casewright` : 'Casewright';

  return (
    <div className="titlebar">
      <div className="tb-brand">
        <span className="tb-glyph">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5h11l5 5v9H4z" />
            <path d="M15 5v5h5" />
            <path d="M8 13h7M8 16h5" />
          </svg>
        </span>
      </div>

      {screen === 'main' && (
        <div className="tb-menubar">
          {menus.map((m) => (
            <button
              key={m.label}
              className={'tb-menu-btn' + (menu && menu.items === m.items ? ' open' : '')}
              onClick={(e) => openMenu(e, m.items)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <div className="tb-title" onDoubleClick={toggleMax}>
        {title}
      </div>

      <div className="tb-winctl">
        <button className="tb-wc" onClick={minimize} title="Minimize" aria-label="Minimize">
          <WinMin />
        </button>
        <button className="tb-wc" onClick={toggleMax} title={maximized ? 'Restore' : 'Maximize'} aria-label="Maximize">
          {maximized ? <WinRestore /> : <WinMax />}
        </button>
        <button className="tb-wc close" onClick={close} title="Close" aria-label="Close">
          <WinClose />
        </button>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}
