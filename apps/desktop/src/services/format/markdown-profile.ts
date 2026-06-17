import { MARKDOWN_TARGETS, type MarkdownTarget } from '@/schemas';

// ---------------------------------------------------------------------------
// Markdown target profiles
//
// A repo targets one markdown renderer (its config's `markdownTarget`). The only
// thing that actually diverges across the named platforms today is nested-list
// indentation: CommonMark/markdown-it renderers (Azure DevOps wiki, GitHub, GitLab)
// only treat a child list as nested when it's indented to the parent's content
// column, so a 4-space-per-depth unit nests correctly under both `- ` and `1. `
// while never reaching the indented-code-block threshold. Every target therefore
// resolves to the same 4-space unit for now; the profile is the single place to add
// per-platform rules (tables, admonitions, task lists, …) later.
// ---------------------------------------------------------------------------

export interface MarkdownProfile {
  id: MarkdownTarget;
  /** Human-facing label for the picker. */
  label: string;
  /** Whitespace emitted per list-nesting level. */
  indentUnit: string;
}

const FOUR_SPACE = '    ';

const PROFILES: Record<MarkdownTarget, MarkdownProfile> = {
  commonmark: { id: 'commonmark', label: 'Generic (CommonMark)', indentUnit: FOUR_SPACE },
  'azure-devops': { id: 'azure-devops', label: 'Azure DevOps Wiki', indentUnit: FOUR_SPACE },
  github: { id: 'github', label: 'GitHub', indentUnit: FOUR_SPACE },
  gitlab: { id: 'gitlab', label: 'GitLab', indentUnit: FOUR_SPACE },
};

/** Resolve a target id to its profile (falls back to the portable CommonMark default). */
export function getProfile(target: MarkdownTarget | undefined): MarkdownProfile {
  return (target && PROFILES[target]) || PROFILES.commonmark;
}

/** The profiles in registry order — drives the settings picker. */
export const MARKDOWN_PROFILES: MarkdownProfile[] = MARKDOWN_TARGETS.map((t) => PROFILES[t]);

// ---------------------------------------------------------------------------
// List re-indenter
//
// Renormalizes the indentation of nested markdown lists in free-form body text to
// the target profile's unit, rewriting ONLY leading whitespace and leaving every
// other byte (markers, ordered delimiters, content, tables, emphasis, links)
// untouched. Nesting depth is recovered structurally from relative indentation, so
// it migrates legacy 2-space bodies and is idempotent on already-normalized ones.
// Content inside fenced code blocks is shifted by the same constant delta as the
// fence's opening line, preserving the code's internal indentation.
// ---------------------------------------------------------------------------

const LIST_RE = /^( *)([-*+]|\d+[.)])( +)(.*)$/;
const FENCE_RE = /^( *)(`{3,}|~{3,})(.*)$/;

const leadingSpaces = (s: string): number => s.match(/^ */)?.[0].length ?? 0;

/** Re-emit `line` with `targetLeading` spaces of indentation, preserving its content verbatim. */
const setLeading = (line: string, targetLeading: number): string =>
  ' '.repeat(Math.max(0, targetLeading)) + line.slice(leadingSpaces(line));

/** A currently-open list item at one nesting level, with its source/target indents. */
interface Frame {
  /** Indent of this level's markers in the source. */
  srcIndent: number;
  /** Indent where this item's content begins in the source (marker indent + marker + spaces). */
  contentSrc: number;
  /** Indent where this item's content begins in the rewritten output. */
  contentTgt: number;
}

/**
 * Renormalize nested-list indentation in `text` to `profile.indentUnit`. Non-list
 * content passes through unchanged; a body with no list markers is returned as-is.
 */
export function reindentLists(text: string, profile: MarkdownProfile): string {
  if (!text.includes('\n') && !LIST_RE.test(text)) return text;
  if (!text.split('\n').some((l) => LIST_RE.test(l))) return text; // fast path: nothing to do

  const unit = profile.indentUnit.length;
  const out: string[] = [];
  const stack: Frame[] = [];
  let fenceDelta: number | null = null; // non-null while inside a fenced code block
  let fenceMark = '';
  let fenceLen = 0;

  /** Target leading for a non-marker line, mapped against the deepest open list item. */
  const continuationLeading = (ind: number): number => {
    const top = stack[stack.length - 1];
    const rel = ind - top.contentSrc;
    return rel >= 0 ? top.contentTgt + rel : top.contentTgt;
  };

  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      out.push(''); // blank lines stay blank (and keep loose lists open)
      continue;
    }

    // Inside a fenced code block: shift by the fence's delta, watch for the closer.
    if (fenceDelta !== null) {
      out.push(setLeading(line, leadingSpaces(line) + fenceDelta));
      const close = FENCE_RE.exec(line);
      if (close && close[2][0] === fenceMark && close[2].length >= fenceLen && close[3].trim() === '') {
        fenceDelta = null;
      }
      continue;
    }

    const ind = leadingSpaces(line);

    // Fence opener — indent it like any content line, then remember the delta for its body.
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const target = stack.length && ind > 0 ? continuationLeading(ind) : ind;
      fenceDelta = target - ind;
      fenceMark = fence[2][0];
      fenceLen = fence[2].length;
      out.push(setLeading(line, target));
      continue;
    }

    const m = LIST_RE.exec(line);
    if (m) {
      while (stack.length && stack[stack.length - 1].srcIndent > ind) stack.pop();
      const same = stack.length > 0 && stack[stack.length - 1].srcIndent === ind;
      const depth = same ? stack.length - 1 : stack.length;
      const markerWidth = m[2].length + m[3].length;
      const tgtIndent = depth * unit;
      const frame: Frame = {
        srcIndent: ind,
        contentSrc: ind + markerWidth,
        contentTgt: tgtIndent + markerWidth,
      };
      if (same) stack[stack.length - 1] = frame;
      else stack.push(frame);
      out.push(setLeading(line, tgtIndent));
      continue;
    }

    // Non-marker line: end the list on a flush-left line, else treat as item continuation.
    if (ind === 0 || stack.length === 0) {
      stack.length = 0;
      out.push(line);
      continue;
    }
    out.push(setLeading(line, continuationLeading(ind)));
  }

  return out.join('\n');
}
