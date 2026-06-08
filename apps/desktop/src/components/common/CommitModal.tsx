import { useState } from 'react';
import { I } from '@/components/icons';
import { Button, Field, Modal, ModalBody, ModalFooter, ModalHeader, Tag, Textarea } from '@/components/ui';
import { useApp } from '@/store/app-store';
import type { Change } from '@/types';

const keyOf = (c: Change) => c.kind + ':' + c.refId;

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
        <span className="ricon2" style={{ color: 'var(--accent)' }}>
          {I.commit({ size: 18 })}
        </span>
        <h3>Commit changes</h3>
        <Tag style={{ marginLeft: 'auto' }}>
          {n} of {changes.length} staged
        </Tag>
      </ModalHeader>
      <ModalBody style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {changes.length === 0 ? (
          <div className="lint-note">
            {I.check({ size: 14 })} Working tree clean — nothing to commit.
          </div>
        ) : (
          <>
            <div className="commit-files">
              {changes.map((c) => {
                const k = keyOf(c);
                return (
                  <div key={k} className="cf-row" onClick={() => toggle(k)}>
                    <span className={'cf-check' + (sel[k] ? ' on' : '')}>{I.check({ size: 12 })}</span>
                    <span className={'cf-stat ' + c.status}>{c.status}</span>
                    <span className="cf-path">
                      <span className="dir">{c.path.replace(/\/[^/]+$/, '/')}</span>
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
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
              />
            </Field>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <span className="muted" style={{ marginRight: 'auto', fontSize: 12 }}>
          {I.branch({ size: 13 })} main
        </span>
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
