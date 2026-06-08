import { I } from '@/components/icons';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui';
import { useApp } from '@/store/app-store';

const baseName = (p: string): string => p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || 'repository';

export function TopBar() {
  const { workspace, workspaces, repoPath, branch, ahead, behind, changes, setWorkspace, goHome, doPush, doPull, setModal, toast } =
    useApp();
  const dirty = changes.length;
  if (!workspace) return null;
  const repoName = baseName(repoPath);

  return (
    <div className="flex h-[46px] flex-none items-center gap-2.5 border-b border-border bg-panel-2 px-3">
      <Button variant="ghost" icon title="Repositories" onClick={goHome}>
        {I.repo({ size: 16 })}
      </Button>

      <div className="relative flex min-w-0 items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex max-w-[280px] items-center gap-2 rounded-md border border-border bg-panel py-1 pl-[9px] pr-2 text-[13px] hover:bg-raise data-[state=open]:bg-raise">
              <span className="grid size-[26px] shrink-0 place-items-center rounded-[7px] bg-[oklch(0.55_0.13_256)] shadow-[inset_0_1px_0_oklch(1_0_0/0.25)]">
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 5h11l5 5v9H4z" />
                  <path d="M15 5v5h5" />
                </svg>
              </span>
              <span className="whitespace-nowrap font-mono text-[12px] text-ink-3">{repoName} /</span>
              <span className="whitespace-nowrap font-semibold">{workspace.name}</span>
              {I.chevronDown({ size: 13 })}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[240px]">
            <div className="px-1.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-faint">
              Workspaces · casewright.json
            </div>
            {workspaces.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onSelect={() => {
                  setWorkspace(w);
                  toast('Switched to ' + w.name);
                }}
              >
                <span className="grid shrink-0 place-items-center text-ink-3 group-data-[highlighted]:text-accent-ink">
                  {I.folder({ size: 14 })}
                </span>
                <div className="flex-1">
                  <div className="font-semibold">{w.name}</div>
                  <div className="font-mono text-[11px] text-ink-faint">{w.path}</div>
                </div>
                {w.id === workspace.id && <span className="text-accent">{I.check({ size: 13 })}</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-panel px-[9px] py-[3px] font-mono text-[12px] text-ink-2">
        {I.branch({ size: 13 })}
        {branch}
        {ahead || behind ? (
          <span className={'inline-flex items-center gap-0.5' + (dirty ? ' text-blocked' : '')}>
            {behind ? <span>↓{behind}</span> : null}
            {ahead ? <span>↑{ahead}</span> : null}
          </span>
        ) : null}
        {dirty ? (
          <span className="inline-flex items-center gap-0.5 text-blocked" title={dirty + ' uncommitted file(s)'}>
            <span className="size-[7px] rounded-full bg-blocked" />
            {dirty}
          </span>
        ) : null}
      </span>

      <div className="ml-auto flex items-center gap-[7px]">
        <Button onClick={doPull}>
          {I.pull({ size: 15 })}Pull
          {behind ? (
            <span className="inline-grid h-4 min-w-4 place-items-center rounded-full bg-blocked-soft px-[5px] font-mono text-[10.5px] font-semibold text-[oklch(0.5_0.12_66)]">
              {behind}
            </span>
          ) : null}
        </Button>
        <Button onClick={() => setModal('commit')}>
          {I.commit({ size: 15 })}Commit
          {dirty ? (
            <span className="inline-grid h-4 min-w-4 place-items-center rounded-full bg-accent-soft px-[5px] font-mono text-[10.5px] font-semibold text-accent-ink">
              {dirty}
            </span>
          ) : null}
        </Button>
        <Button variant="primary" onClick={doPush} disabled={!ahead}>
          {I.push({ size: 15 })}Push
          {ahead ? (
            <span className="inline-grid h-4 min-w-4 place-items-center rounded-full bg-[oklch(1_0_0/0.22)] px-[5px] font-mono text-[10.5px] font-semibold text-white">
              {ahead}
            </span>
          ) : null}
        </Button>
      </div>
    </div>
  );
}
