import { useState } from 'react';
import { I } from '@/components/icons';
import { Button, Field, Input, Modal, ModalBody, ModalFooter, ModalHeader, Select } from '@/components/ui';
import { cn } from '@/lib/utils';
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

  const scopeOpt = (on: boolean) =>
    cn(
      'flex cursor-pointer items-start gap-2.5 rounded-md border px-[13px] py-[11px]',
      on ? 'border-accent bg-accent-soft' : 'border-border hover:border-accent-line',
    );
  const radio = (on: boolean) =>
    cn('mt-px grid size-4 shrink-0 place-items-center rounded-full border-[1.5px]', on ? 'border-accent' : 'border-border-2');

  return (
    <Modal onClose={close}>
      <ModalHeader>
        <span className="grid place-items-center text-accent">{I.grid({ size: 18 })}</span>
        <h3>New test run</h3>
      </ModalHeader>
      <ModalBody style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Run name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Scope — which cases to seed">
          <div className="flex flex-col gap-2">
            <div className={scopeOpt(scope === 'tag')} onClick={() => setScope('tag')}>
              <span className={radio(scope === 'tag')}>{scope === 'tag' && <span className="size-2 rounded-full bg-accent" />}</span>
              <div className="flex-1">
                <div className="text-[13px] font-semibold">By tag</div>
                <div className="mt-0.5 text-[12px] text-ink-3">Every case carrying a tag.</div>
                {scope === 'tag' && (
                  <Select
                    className="mt-2 w-auto"
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
            <div className={scopeOpt(scope === 'suite')} onClick={() => setScope('suite')}>
              <span className={radio(scope === 'suite')}>{scope === 'suite' && <span className="size-2 rounded-full bg-accent" />}</span>
              <div className="flex-1">
                <div className="text-[13px] font-semibold">By suite</div>
                <div className="mt-0.5 text-[12px] text-ink-3">All cases in a folder (and its sub-suites).</div>
                {scope === 'suite' && (
                  <Select
                    className="mt-2 w-auto"
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
            <div className={scopeOpt(scope === 'all')} onClick={() => setScope('all')}>
              <span className={radio(scope === 'all')}>{scope === 'all' && <span className="size-2 rounded-full bg-accent" />}</span>
              <div>
                <div className="text-[13px] font-semibold">Whole workspace</div>
                <div className="mt-0.5 text-[12px] text-ink-3">Every case in {ctx.workspace?.name ?? 'this workspace'}.</div>
              </div>
            </div>
          </div>
        </Field>
        <div className="text-[12.5px] text-ink-3">
          {I.layers({ size: 13 })} Seeds <b>{count}</b> rows · keyed on stable <span className="font-mono">case_id</span> · result{' '}
          <span className="font-mono">not_run</span>.
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
