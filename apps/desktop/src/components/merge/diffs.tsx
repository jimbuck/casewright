import { I } from '@/components/icons';
import { wordDiff } from '@/utils/diff';
import { renderInline } from '@/utils/markdown';
import { listText, numberSteps, stepText } from '@/utils/steps';
import type { MergeElement, Step } from '@/types';

type Side = 'ours' | 'theirs';

/** Serialize one side of a conflicting element to editable text. */
export function serialize(el: MergeElement, which: Side): string {
  if (el.kind === 'steps') return stepText(el[which]);
  if (el.kind === 'list' || el.kind === 'tags') return listText(el[which]);
  return el[which]; // field | prose
}

/** Word-level prose diff: render one side with its add/del highlights. */
export function ProseDiff({
  ours,
  theirs,
  side,
  prose,
}: {
  ours: string;
  theirs: string;
  side: Side;
  prose?: boolean;
}) {
  const { del, add } = wordDiff(ours, theirs);
  const toks = side === 'ours' ? del : add;
  const cls = side === 'ours' ? 'w-del' : 'w-add';
  return (
    <div className={'diff-text' + (prose ? ' prose' : '')}>
      {toks.map((t, i) =>
        t.t === 'same' ? (
          <span key={i}>{t.v}</span>
        ) : (
          <span key={i} className={cls}>
            {t.v}
          </span>
        ),
      )}
    </div>
  );
}

/** List diff: mark items unique to this side. */
export function ListDiff({ ours, theirs, side }: { ours: string[]; theirs: string[]; side: Side }) {
  const mine = side === 'ours' ? ours : theirs;
  const other = side === 'ours' ? theirs : ours;
  const oset = new Set(other);
  return (
    <ul className="diff-list">
      {mine.map((it, i) => {
        const changed = !oset.has(it);
        return (
          <li key={i} className={changed ? (side === 'ours' ? 'removed' : 'added') : ''}>
            <span className="mk">–</span>
            <span>{renderInline(it, 'ld' + side + i)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function StepsDiff({ ours, theirs, side }: { ours: Step[]; theirs: Step[]; side: Side }) {
  const mine = side === 'ours' ? ours : theirs;
  const other = side === 'ours' ? theirs : ours;
  const oset = new Set(other.map((s) => s.text));
  const nums = numberSteps(mine);
  return (
    <div className="diff-steps">
      {mine.map((s, i) => {
        const changed = !oset.has(s.text);
        return (
          <div
            key={i}
            className={'stp ' + (changed ? (side === 'ours' ? 'removed' : 'added') : '')}
            style={{
              paddingLeft: s.depth * 18,
              color: changed ? (side === 'ours' ? 'var(--del)' : 'var(--add)') : undefined,
              textDecoration: changed && side === 'ours' ? 'line-through' : undefined,
            }}
          >
            <span className="sn">{nums[i]}.</span>
            <span>{s.text}</span>
          </div>
        );
      })}
    </div>
  );
}

export function MergedPreview({ el, text }: { el: MergeElement; text: string }) {
  const prose = el.kind === 'prose' || el.kind === 'field';
  let body;
  if (el.kind === 'steps') {
    const lines = text.split('\n');
    body = (
      <div className="diff-steps">
        {lines.map((ln, i) => {
          const depth = (ln.match(/^ */)?.[0].length ?? 0) / 2;
          return (
            <div key={i} className="stp" style={{ paddingLeft: depth * 18 }}>
              <span className="sn">{i + 1}.</span>
              <span>{ln.trim()}</span>
            </div>
          );
        })}
      </div>
    );
  } else if (el.kind === 'list' || el.kind === 'tags') {
    body = (
      <ul className="diff-list">
        {text.split('\n').map((ln, i) => (
          <li key={i}>
            <span className="mk">–</span>
            <span>{renderInline(ln, 'mp' + i)}</span>
          </li>
        ))}
      </ul>
    );
  } else {
    body = <span>{renderInline(text, 'mp')}</span>;
  }
  return (
    <div className={'merged-preview' + (prose ? ' prose' : '')}>
      <div className="mp-h">{I.check({ size: 12 })} Merged result</div>
      <div className="mp-body">{body}</div>
    </div>
  );
}
