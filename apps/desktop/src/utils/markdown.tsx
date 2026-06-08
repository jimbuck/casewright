import type { ReactNode } from 'react';

/**
 * Render the inline-formatting whitelist to React nodes.
 * Allowed: **bold**  *italic*  ~~strike~~  `code`  [text](url)
 */
export function renderInline(text: string | null | undefined, keyPrefix = 'k'): ReactNode {
  if (text == null) return null;
  const out: ReactNode[] = [];
  let k = 0;
  const rx =
    /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(~~([^~]+)~~)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${k++}`;
    if (m[1]) out.push(<strong key={key}>{m[2]}</strong>);
    else if (m[3]) out.push(<em key={key}>{m[4]}</em>);
    else if (m[5]) out.push(<s key={key}>{m[6]}</s>);
    else if (m[7]) out.push(<code key={key} className="md-code">{m[8]}</code>);
    else if (m[9])
      out.push(
        <a key={key} href={m[11]} className="md-link" onClick={(ev) => ev.preventDefault()}>
          {m[10]}
        </a>,
      );
    last = rx.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type TextField = HTMLInputElement | HTMLTextAreaElement;

/** Wrap the current selection in markers inside a textarea/input. */
export function wrapSelection(el: TextField, before: string, after: string = before) {
  const s = el.selectionStart ?? 0;
  const en = el.selectionEnd ?? 0;
  const v = el.value;
  const sel = v.slice(s, en) || 'text';
  const next = v.slice(0, s) + before + sel + after + v.slice(en);
  return { value: next, selStart: s + before.length, selEnd: s + before.length + sel.length };
}

/** Strip blocked block-level constructs (headings, lists, quotes, fences, rules). */
export function sanitizeInline(text: string): string {
  return text
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // headings
    .replace(/^\s*>\s?/gm, '') // blockquotes
    .replace(/^\s*[-*+]\s+/gm, '') // bullets
    .replace(/^\s*\d+\.\s+/gm, '') // ordered
    .replace(/^\s*(```|~~~).*$/gm, '') // fences
    .replace(/^\s*([-*_])\1{2,}\s*$/gm, ''); // hr
}

export function hasBlockConstructs(text: string | null | undefined): boolean {
  return /(^\s{0,3}#{1,6}\s)|(^\s*>\s)|(^\s*[-*+]\s)|(^\s*\d+\.\s)|(```)/m.test(text || '');
}
