import { I } from '@/components/icons';
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@/components/ui';
import { useApp } from '@/store/app-store';

/**
 * VS Code–style conflict prompt: a case has unsaved in-app edits and its file changed
 * on disk to something different. Ask whether to keep the in-app version (overwrite the
 * file) or take the version on disk (discard the in-app edits).
 */
export function ExternalConflictModal() {
  const { externalConflicts, resolveExternalConflict } = useApp();
  const n = externalConflicts.length;

  return (
    <Modal onClose={() => {}}>
      <ModalHeader>
        <span className="grid place-items-center text-blocked">{I.warn({ size: 18 })}</span>
        <h3>{n === 1 ? 'A case' : `${n} cases`} changed on disk</h3>
      </ModalHeader>
      <ModalBody style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="text-[13px] text-ink-2">
          {n === 1 ? 'This case was' : 'These cases were'} changed outside the app while you had unsaved edits. Choose which
          version to keep.
        </p>
        <ul className="flex max-h-40 flex-col gap-1 overflow-auto rounded-md border border-border bg-panel-2 p-2">
          {externalConflicts.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-[12.5px]">
              <span className="shrink-0 font-mono text-ink-faint">{c.displayId}</span>
              <span className="min-w-0 truncate">{c.title}</span>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-ink-3">
          <b>Keep my version</b> overwrites the file with your edits. <b>Use the version on disk</b> discards your edits and
          reloads.
        </p>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={() => void resolveExternalConflict('theirs')}>
          Use the version on disk
        </Button>
        <Button variant="primary" onClick={() => void resolveExternalConflict('mine')}>
          Keep my version
        </Button>
      </ModalFooter>
    </Modal>
  );
}
