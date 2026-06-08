import { useState } from 'react';
import { I } from '@/components/icons';
import { Button, Field, Modal, ModalBody, ModalFooter, ModalHeader, Tag, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app-store';
import type { Change } from '@/types';

const keyOf = (c: Change) => c.kind + ':' + c.refId;

const STAT_COLOR: Record<string, string> = { M: 'text-blocked', A: 'text-pass', D: 'text-fail' };

export function CommitModal() {
  const { changes, doCommit, setModal } = useApp();
  const close = () => setModal(null);
  const [sel, setSel] = useState<Record<string, boolean>>(() =>
    changes.reduce<Record<string, boolean>>((a, c) => ((a[keyOf(c)] = true), a), {}),
  );
  const [msg, setMsg] = useState('');
  const toggle = (k: string) => setSel((s) => ({ ...s, [k]: !s[k] }));
  const selectedKeys = changes.filter((c) => sel[keyOf(c)]).map(keyOf);
  const n = selectedKeys.length;

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
              {changes.map((c) => {
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
                    <span className={cn('w-[14px] shrink-0 text-center font-mono text-[11px] font-bold', STAT_COLOR[c.status])}>
                      {c.status}
                    </span>
                    <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] text-ink-2">
                      <span className="text-ink-faint">{c.path.replace(/\/[^/]+$/, '/')}</span>
                      {c.path.split('/').pop()}
                    </span>
                  </div>
                );
              })}
            </div>
            <Field label="Message">
              <Textarea
                rows={3}
                placeholder="Describe what changed…"
                value={msg}
                onChange={(ev) => setMsg(ev.target.value)}
                className="font-mono text-[12.5px]"
              />
            </Field>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <span className="mr-auto flex items-center gap-1.5 text-[12px] text-ink-3">{I.branch({ size: 13 })} main</span>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" disabled={n === 0 || !msg.trim()} onClick={() => doCommit(selectedKeys, msg)}>
          {I.commit({ size: 14 })} Commit {n} file{n === 1 ? '' : 's'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
