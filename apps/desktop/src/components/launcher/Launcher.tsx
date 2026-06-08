import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { recents } from '@/data/sample';
import { useApp } from '@/store/app-store';

export function Launcher() {
  const { openRepo } = useApp();
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col bg-[linear-gradient(160deg,oklch(0.30_0.04_256),oklch(0.24_0.03_262))] px-[54px] py-[52px] text-[oklch(0.97_0.01_256)]">
        <div className="mb-auto flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-[oklch(0.55_0.13_256)] shadow-[inset_0_1px_0_oklch(1_0_0/0.25)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5h11l5 5v9H4z" />
              <path d="M15 5v5h5" />
              <path d="M8 13h7M8 16h5" />
            </svg>
          </div>
          <span className="font-mono text-[13px] tracking-[0.04em] text-[oklch(0.78_0.02_256)]">casewright</span>
        </div>
        <h1 className="m-0 mb-3 text-[30px] font-semibold tracking-[-0.02em]">Casewright</h1>
        <p className="max-w-[30ch] font-read text-[17px] leading-[1.5] text-[oklch(0.88_0.02_256)]">
          A craftsman's editor for manual test cases — markdown on disk, Git as the data store.
        </p>
        <div className="mt-[22px] flex flex-col gap-[7px] font-mono text-[12.5px] text-[oklch(0.74_0.02_256)]">
          <div className="flex items-center gap-2">{I.repo({ size: 14 })} cases as plain markdown</div>
          <div className="flex items-center gap-2">{I.layers({ size: 14 })} suites are just folders</div>
          <div className="flex items-center gap-2">{I.merge({ size: 14 })} structured 3-way merge</div>
        </div>
        <div className="mt-9 text-[11.5px] text-[oklch(0.66_0.02_256)]">v1 · local-first · no telemetry</div>
      </div>

      <div className="flex min-h-0 flex-col px-[42px] py-10">
        <h2 className="m-0 mb-1 text-[13px] uppercase tracking-[0.06em] text-ink-3">Open a repository</h2>
        <div className="mb-[26px] mt-4 flex gap-2.5">
          <Button variant="primary" onClick={openRepo}>
            {I.folderOpen({ size: 15 })} Open repository…
          </Button>
          <Button onClick={openRepo}>{I.plus({ size: 15 })} Clone from Azure DevOps</Button>
        </div>
        <div className="flex items-center justify-between px-0.5 pb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">Recent</span>
        </div>
        <div className="-mx-2 flex min-h-0 flex-col gap-2 overflow-auto px-2">
          {recents.map((r, i) => (
            <button
              key={i}
              className="flex items-center gap-[13px] rounded-md border border-border bg-panel px-[14px] py-[13px] text-left transition hover:border-accent-line hover:bg-accent-soft active:translate-y-px"
              onClick={openRepo}
            >
              <div className="grid size-[34px] shrink-0 place-items-center rounded-[8px] border border-border bg-sunken text-ink-2">
                {I.repo({ size: 17 })}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13.5px] font-semibold">
                  {r.name}
                  {r.current && (
                    <span className="rounded-full bg-pass-soft px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.04em] text-pass">
                      open
                    </span>
                  )}
                </div>
                <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11.5px] text-ink-3">
                  {r.path}
                </div>
              </div>
              <div className="shrink-0 text-right text-[11.5px] text-ink-3">
                <div className="inline-flex items-center gap-1 font-mono text-ink-2">
                  {I.branch({ size: 12 })} {r.branch}
                </div>
                <div className="mt-1">
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
