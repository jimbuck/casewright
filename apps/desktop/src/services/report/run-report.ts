/**
 * NW.js side of the PDF export: gather the report HTML from the pure builder, write it
 * to a temp file, and drive NW.js's native print-to-PDF on a hidden window. Kept apart
 * from the store (data is passed in) and from the pure HTML builder so each layer stays
 * independently testable.
 */
import { node } from '@/lib/node';
import { isNwjs, printToPdf, saveFile } from '@/lib/nwjs';
import { buildRunReportHtml, type RunReportModel } from './run-report-html';

export type ExportReason = 'cancelled' | 'not-nwjs' | 'error';
export interface ExportResult {
  ok: boolean;
  /** Absolute path of the written PDF, when `ok`. */
  path?: string;
  reason?: ExportReason;
}

/** A filesystem-safe default filename (with `.pdf`) from a run name. */
function defaultFileName(name: string): string {
  const base = (name || 'run')
    .replace(/[/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${base || 'run'}.pdf`;
}

/**
 * Render `model` to a PDF the user picks a destination for. Returns a discriminated
 * result rather than throwing so the caller can distinguish a cancelled dialog from a
 * real failure. The temp HTML is always cleaned up.
 */
export async function exportRunReport(model: RunReportModel): Promise<ExportResult> {
  if (!isNwjs()) return { ok: false, reason: 'not-nwjs' };

  const dest = await saveFile(defaultFileName(model.runName));
  if (!dest) return { ok: false, reason: 'cancelled' };

  const fsp = node.fsp();
  const path = node.path();
  const tmp = path.join(node.os().tmpdir(), `casewright-report-${Date.now()}.html`);

  try {
    await fsp.writeFile(tmp, buildRunReportHtml(model), 'utf8');
    // file:// URL via Node so Windows path separators / drive letters are handled correctly.
    const fileUrl = node.url().pathToFileURL(tmp).href;
    await printToPdf(fileUrl, dest);
    return { ok: true, path: dest };
  } catch {
    return { ok: false, reason: 'error' };
  } finally {
    await fsp.rm(tmp, { force: true }).catch(() => {});
  }
}
