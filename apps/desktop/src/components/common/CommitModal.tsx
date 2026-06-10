import { useState } from 'react';
import { I } from '@/components/icons';
import { Button, Field, Modal, ModalBody, ModalFooter, ModalHeader, Tag, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app-store';
import type { Change } from '@/types';

const keyOf = (c: Change) => c.kind + ':' + c.refId;

const STAT_COLOR: Record<string, string> = { M: 'text-blocked', A: 'text-pass', D: 'text-fail' };
const STAT_LABEL: Record<string, string> = { A: 'Added', M: 'Modified', D: 'Deleted' };

/** Changes are shown grouped by what they are, not as raw files — a run is one row for its
 *  whole folder, a case is one row by title. */
const GROUPS = [
  { kind: 'case' as const, title: 'Test cases', icon: I.file },
  { kind: 'run' as const, title: 'Test runs', icon: I.grid },
];

const VERB: Record<string, string> = { A: 'Add', M: 'Update', D: 'Remove' };
const NOUN: Record<'case' | 'run', [string, string]> = {
  case: ['test case', 'test cases'],
  run: ['test run', 'test runs'],
};

/** A sensible default commit message derived from the selected entities (the user can override it). */
function suggestMessage(sel: Change[]): string {
  if (sel.length === 0) return '';
  if (sel.length === 1) {
    const c = sel[0];
    return `${VERB[c.status] ?? 'Update'} ${NOUN[c.kind][0]} "${c.label}"`;
  }
  const parts = (['case', 'run'] as const)
    .map((kind) => ({ kind, n: sel.filter((c) => c.kind === kind).length }))
    .filter((p) => p.n > 0)
    .map((p) => `${p.n} ${NOUN[p.kind][p.n === 1 ? 0 : 1]}`);
  const statuses = new Set(sel.map((c) => c.status));
  const verb = statuses.size === 1 ? (VERB[[...statuses][0]] ?? 'Update') : 'Update';
  return `${verb} ${parts.join(' and ')}`;
}

export function CommitModal() {
  const { changes, branch, doCommit, setModal } = useApp();
  const close = () => setModal(null);
  const [sel, setSel] = useState<Record<string, boolean>>(() =>
    changes.reduce<Record<string, boolean>>((a, c) => ((a[keyOf(c)] = true), a), {}),
  );
  // null → show the auto-suggested message (and keep it in sync with the selection); once the user
  // types, `msg` holds their text and the suggestion no longer overrides it.
  const [msg, setMsg] = useState<string | null>(null);
  const toggle = (k: string) => setSel((s) => ({ ...s, [k]: !s[k] }));
  const selectedChanges = changes.filter((c) => sel[keyOf(c)]);
  const selectedKeys = selectedChanges.map(keyOf);
  const n = selectedKeys.length;
  const message = msg ?? suggestMessage(selectedChanges);

  return (
    <Modal onClose={close}>
      <ModalHeader>
        <span className="grid place-items-center text-accent">{I.commit({ size: 18 })}</span>
        <h3>Commit changes</h3>
        <Tag className="ml-auto">
          {n} of {changes.length} staged
        </Tag>
      </ModalHeader>
      <ModalBody style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {changes.length === 0 ? (
          <div className="flex items-center gap-[7px] rounded-md border border-dashed border-border-2 bg-panel-2 px-3 py-[9px] text-[12px] text-ink-3">
            {I.check({ size: 14 })} Working tree clean — nothing to commit.
          </div>
        ) : (
          <>
            <div className="flex flex-col overflow-hidden rounded-md border border-border">
              {GROUPS.map((g) => {
                const items = changes.filter((c) => c.kind === g.kind);
                if (!items.length) return null;
                return (
                  <div key={g.kind} className="flex flex-col">
                    <div className="flex items-center gap-1.5 border-b border-border bg-panel-2 px-[11px] py-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-ink-faint">
                      {g.icon({ size: 12 })}
                      {g.title}
                      <span className="text-ink-3">({items.length})</span>
                    </div>
                    {items.map((c) => {
                      const k = keyOf(c);
                      return (
                        <div
                          key={k}
                          className="flex cursor-pointer items-center gap-2.5 border-b border-border px-[11px] py-2 last:border-b-0 hover:bg-panel-2"
                          onClick={() => toggle(k)}
                        >
                          <span
                            className={cn(
                              'grid size-4 shrink-0 place-items-center rounded-sm border-[1.5px] border-border-2 text-transparent',
                              sel[k] && 'border-accent bg-accent text-white',
                            )}
                          >
                            {I.check({ size: 12 })}
                          </span>
                          <span
                            title={STAT_LABEL[c.status] ?? c.status}
                            className={cn('w-[14px] shrink-0 cursor-help text-center font-mono text-[11px] font-bold', STAT_COLOR[c.status])}
                          >
                            {c.status}
                          </span>
                          <span className="truncate text-[13px] text-ink-2">{c.label}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <Field label="Message">
              <Textarea
                rows={3}
                placeholder="Describe what changed…"
                value={message}
                onChange={(ev) => setMsg(ev.target.value)}
                className="font-mono text-[12.5px]"
              />
            </Field>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <span className="mr-auto flex items-center gap-1.5 text-[12px] text-ink-3">{I.branch({ size: 13 })} {branch}</span>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" disabled={n === 0 || !message.trim()} onClick={() => doCommit(selectedKeys, message)}>
          {I.commit({ size: 14 })} Commit {n} change{n === 1 ? '' : 's'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
