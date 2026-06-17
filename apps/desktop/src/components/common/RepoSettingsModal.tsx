import { useState } from 'react';
import { I } from '@/components/icons';
import { Button, Field, Modal, ModalBody, ModalFooter, ModalHeader, Select } from '@/components/ui';
import type { MarkdownTarget } from '@/schemas';
import { MARKDOWN_PROFILES } from '@/services/format/markdown-profile';
import { useApp } from '@/store/app-store';

/**
 * Repo-wide settings. Currently just the **markdown target** — the renderer the repo's
 * cases must serialize for (e.g. an Azure DevOps wiki pointed straight at the repo). It
 * governs nested-list indentation; changing it (or re-running the reformat) renormalizes
 * every case so nested steps/lists render correctly on that platform.
 */
export function RepoSettingsModal() {
  const ctx = useApp();
  const close = () => ctx.setModal(null);
  const [target, setTarget] = useState<MarkdownTarget>(ctx.markdownTarget);
  const [busy, setBusy] = useState(false);

  const changed = target !== ctx.markdownTarget;
  const count = ctx.cases.length;

  const apply = async () => {
    setBusy(true);
    try {
      if (changed) await ctx.setMarkdownTarget(target);
      if (count) {
        await ctx.reformatAllCases();
        ctx.toast(`Reformatted ${count} case${count === 1 ? '' : 's'} for ${MARKDOWN_PROFILES.find((p) => p.id === target)?.label}`);
      } else if (changed) {
        ctx.toast('Markdown format updated');
      }
      close();
    } catch {
      // setMarkdownTarget / reformatAllCases surface their own write errors via the store.
      setBusy(false);
    }
  };

  const primaryLabel = changed
    ? count
      ? `Save & reformat ${count} case${count === 1 ? '' : 's'}`
      : 'Save'
    : `Reformat ${count} case${count === 1 ? '' : 's'}`;

  return (
    <Modal onClose={close} maxWidth={460}>
      <ModalHeader>
        <span className="grid place-items-center text-accent">{I.list({ size: 18 })}</span>
        <h3>Markdown format</h3>
      </ModalHeader>
      <ModalBody style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Target platform">
          <Select value={target} onChange={(e) => setTarget(e.target.value as MarkdownTarget)}>
            {MARKDOWN_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <p className="m-0 text-[12px] leading-relaxed text-ink-3">
          Applies to the whole repository. Casewright normalizes nested-list indentation so cases
          render correctly when this repo is browsed as a wiki. Other markdown is left untouched.
        </p>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" disabled={busy || (!changed && count === 0)} onClick={() => void apply()}>
          {I.check({ size: 14 })} {busy ? 'Working…' : primaryLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
