import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import type { MergeElement, Resolution, ResolutionChoice } from '@/types';
import { ListDiff, MergedPreview, ProseDiff, serialize, StepsDiff } from './diffs';

export interface ConflictElementProps {
  el: MergeElement;
  resKey: string;
  res?: Resolution;
  setRes: (key: string, value: Resolution) => void;
}

/** One conflicting element — side-by-side ours/theirs with take/edit + merged preview. */
export function ConflictElement({ el, resKey, res, setRes }: ConflictElementProps) {
  const choice = res?.choice;
  const prose = el.kind === 'prose' || el.kind === 'field';
  const editing = choice === 'edit';
  const text = res?.text ?? '';

  const pick = (which: ResolutionChoice) =>
    setRes(resKey, { choice: which, text: serialize(el, which === 'edit' ? 'ours' : which) });

  const renderSide = (side: 'ours' | 'theirs') => {
    if (el.kind === 'list' || el.kind === 'tags') return <ListDiff ours={el.ours} theirs={el.theirs} side={side} />;
    if (el.kind === 'steps') return <StepsDiff ours={el.ours} theirs={el.theirs} side={side} />;
    return <ProseDiff ours={el.ours} theirs={el.theirs} side={side} prose={prose} />;
  };

  return (
    <div className="elem is-conflict">
      <div className="elem-h">
        <span className="eh-name">{el.label}</span>
        <span className="eh-mark">{el.kind === 'field' ? 'front-matter' : '## ' + el.label}</span>
        <span className="eh-status">
          {choice ? (
            <span className="chip-resolved">
              {I.check({ size: 12 })} {choice === 'ours' ? 'kept yours' : choice === 'theirs' ? 'kept theirs' : 'edited'}
            </span>
          ) : (
            <span className="chip-conflict">{I.warn({ size: 12 })} conflict</span>
          )}
        </span>
      </div>
      <div className="sides">
        <div className={'side ours' + (choice === 'ours' ? ' chosen' : '')}>
          <div className="side-h">
            <span className="lbl">Yours</span>
            <span className="who">stage :2 · local</span>
            <span className="side-take">
              <Button size="sm" onClick={() => pick('ours')}>
                {choice === 'ours' ? I.check({ size: 12 }) : null} Take yours
              </Button>
            </span>
          </div>
          {renderSide('ours')}
        </div>
        <div className={'side theirs' + (choice === 'theirs' ? ' chosen' : '')}>
          <div className="side-h">
            <span className="lbl">Theirs</span>
            <span className="who">stage :3 · incoming</span>
            <span className="side-take">
              <Button size="sm" onClick={() => pick('theirs')}>
                {choice === 'theirs' ? I.check({ size: 12 }) : null} Take theirs
              </Button>
            </span>
          </div>
          {renderSide('theirs')}
        </div>
      </div>
      <div className="base-ref">
        <div className="br-h">{I.clock({ size: 12 })} Base · merge-base (stage :1)</div>
        {el.kind === 'steps' ? (
          <div className="diff-steps">
            {el.base.map((s, i) => (
              <div key={i} className="stp" style={{ paddingLeft: s.depth * 18 }}>
                <span className="sn">{i + 1}.</span>
                <span>{s.text}</span>
              </div>
            ))}
          </div>
        ) : el.kind === 'list' || el.kind === 'tags' ? (
          <span>{el.base.join(' · ')}</span>
        ) : (
          <span>{el.base}</span>
        )}
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button size="sm" variant={editing ? 'primary' : 'default'} onClick={() => pick('edit')}>
          {I.edit({ size: 13 })} Edit merged
        </Button>
        {choice && !editing && (
          <span className="muted" style={{ fontSize: 12 }}>
            Resolution applies to the whole {el.kind === 'field' ? 'field' : 'section'}.
          </span>
        )}
      </div>
      {editing && (
        <div style={{ padding: '0 14px 12px' }}>
          <textarea
            className="edit-area"
            value={text}
            onChange={(e) => setRes(resKey, { choice: 'edit', text: e.target.value })}
          />
        </div>
      )}
      {choice && <MergedPreview el={el} text={text} />}
    </div>
  );
}
