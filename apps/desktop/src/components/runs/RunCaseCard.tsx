import { useState } from 'react';
import { I } from '@/components/icons';
import { Input, RES, RESULTS } from '@/components/ui';
import { renderInline } from '@/utils/markdown';
import { rowFailures } from '@/utils/run-items';
import type { Case, Result, RunRow } from '@/types';
import { NotesField } from './NotesField';

/** A compact result chip + dropdown picker (self-contained open state). */
function ResultPicker({ value, onChange }: { value: Result; onChange: (r: Result) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        className="inline-flex items-center gap-[5px] rounded-[5px] border border-border bg-panel px-[9px] py-[3px] font-mono text-[12px] font-semibold hover:bg-raise"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="size-[9px] rounded-[3px]" style={{ background: RES[value].color }} />
        {RES[value].label}
        {I.chevronDown({ size: 12 })}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 flex min-w-[130px] flex-col gap-0.5 rounded-md border border-border-2 bg-panel p-[5px] shadow-[0_12px_30px_var(--shadow)]">
            {RESULTS.map((r) => (
              <button
                key={r.key}
                className="flex items-center gap-2 rounded-sm border-0 bg-transparent px-[9px] py-1.5 text-left text-[12.5px] hover:bg-raise"
                onClick={() => {
                  onChange(r.key);
                  setOpen(false);
                }}
              >
                <span className="size-[9px] shrink-0 rounded-[3px]" style={{ background: r.color }} />
                {r.label}
                {value === r.key && <span className="ml-auto text-accent">{I.check({ size: 13 })}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export interface RunCaseCardProps {
  row: RunRow;
  /** The live case behind this row (for failure text); `undefined` when it was deleted. */
  kase: Case | undefined;
  gone: boolean;
  lastTester: string;
  onResult: (result: Result) => void;
  onNotes: (value: string) => void;
  onTester: (value: string) => void;
  onGuide: () => void;
}

/**
 * One test case in a run, as a stacked card: an always-visible header (id, title, result, tester,
 * executed time) over a section that always shows the failed checklist items + their notes, then
 * this case's notes (rendered markdown with an Edit toggle).
 */
export function RunCaseCard({ row, kase, gone, lastTester, onResult, onNotes, onTester, onGuide }: RunCaseCardProps) {
  const failures = rowFailures(row, kase);

  return (
    <div className="rounded-lg border border-border bg-panel">
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <span className="shrink-0 font-mono text-[12px] text-ink-3">{row.display_id}</span>

        <div className="min-w-0 flex-1">
          {gone ? (
            <span className="text-ink-faint">{row.title}</span>
          ) : (
            <button
              className="truncate rounded-[3px] border-0 bg-transparent p-0 text-left text-[13.5px] text-ink hover:text-accent-ink hover:underline hover:underline-offset-2"
              title="Walk through this case"
              onClick={onGuide}
            >
              {row.title}
            </button>
          )}
          {gone && (
            <span className="ml-1.5 text-[10px] text-fail" title="Case no longer resolves to a live file">
              ⚠ deleted
            </span>
          )}
        </div>

        <ResultPicker value={row.result} onChange={onResult} />

        <Input
          className="w-[120px] shrink-0 font-mono text-[12.5px]"
          value={row.tester}
          placeholder={lastTester || 'Tester'}
          onChange={(e) => onTester(e.target.value)}
        />

        <span className="hidden w-[120px] shrink-0 whitespace-nowrap text-right font-mono text-[11.5px] text-ink-faint sm:block">
          {row.executed_at || '—'}
        </span>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-3.5 py-3">
        {failures.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.05em] text-ink-faint">Failed checks</div>
            <ul className="flex flex-col gap-1 pl-0.5">
              {failures.map((f, k) => (
                <li key={k} className="flex gap-1.5 text-[12.5px] leading-[1.45] text-ink-2">
                  <span className="mt-[5px] size-[6px] shrink-0 rounded-full bg-fail" />
                  <span>
                    {renderInline(f.text, `f${k}`)}
                    {f.note && <span className="text-ink-3"> — {renderInline(f.note, `fn${k}`)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <NotesField value={row.notes} onChange={onNotes} idPrefix={`rn-${row.case_id}`} />
      </div>
    </div>
  );
}
