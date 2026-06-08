import { useState } from 'react';
import { I } from '@/components/icons';
import { Button, Field, Input, Modal, ModalBody, ModalFooter, ModalHeader, Select } from '@/components/ui';
import { useApp } from '@/store/app-store';
import type { RunScope } from '@/types';

export function CreateRunModal() {
  const ctx = useApp();
  const close = () => ctx.setModal(null);
  const [scope, setScope] = useState<RunScope>('tag');
  const [tag, setTag] = useState('Regression');
  const [suite, setSuite] = useState('billing');
  const [name, setName] = useState('Regression — Sprint 13');
  const allTags = [...new Set(ctx.cases.flatMap((c) => c.tags))].sort();
  const suites = ctx.tree.filter((n) => n.type === 'suite');

  const count =
    scope === 'tag'
      ? ctx.cases.filter((c) => c.tags.includes(tag)).length
      : scope === 'suite'
        ? ctx.casesInSuite(suite).length
        : ctx.cases.length;

  return (
    <Modal onClose={close}>
      <ModalHeader>
        <span className="ricon2" style={{ color: 'var(--accent)' }}>
          {I.grid({ size: 18 })}
        </span>
        <h3>New test run</h3>
      </ModalHeader>
      <ModalBody style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Run name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Scope — which cases to seed">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className={'scope-opt' + (scope === 'tag' ? ' on' : '')} onClick={() => setScope('tag')}>
              <span className="radio" />
              <div style={{ flex: 1 }}>
                <div className="so-title">By tag</div>
                <div className="so-sub">Every case carrying a tag.</div>
                {scope === 'tag' && (
                  <Select
                    style={{ marginTop: 8, width: 'auto' }}
                    value={tag}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setTag(e.target.value)}
                  >
                    {allTags.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </Select>
                )}
              </div>
            </div>
            <div className={'scope-opt' + (scope === 'suite' ? ' on' : '')} onClick={() => setScope('suite')}>
              <span className="radio" />
              <div style={{ flex: 1 }}>
                <div className="so-title">By suite</div>
                <div className="so-sub">All cases in a folder (and its sub-suites).</div>
                {scope === 'suite' && (
                  <Select
                    style={{ marginTop: 8, width: 'auto' }}
                    value={suite}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setSuite(e.target.value)}
                  >
                    {suites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            </div>
            <div className={'scope-opt' + (scope === 'all' ? ' on' : '')} onClick={() => setScope('all')}>
              <span className="radio" />
              <div>
                <div className="so-title">Whole workspace</div>
                <div className="so-sub">Every case in {ctx.workspace.name}.</div>
              </div>
            </div>
          </div>
        </Field>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {I.layers({ size: 13 })} Seeds <b>{count}</b> rows · keyed on stable <span className="mono">case_id</span> · result{' '}
          <span className="mono">not_run</span>.
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={close}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => ctx.createRun({ name, scope, tag, suite })}>
          {I.plus({ size: 14 })} Create run
        </Button>
      </ModalFooter>
    </Modal>
  );
}
