import { describe, expect, it } from 'vitest';
import { hasHeadings13, stripHeadings13 } from './markdown';

describe('hasHeadings13', () => {
  it('flags h1–h3 markers, including bare ones', () => {
    for (const s of ['# h1', '## h2', '### h3', '###', '##', '#', '  ## indented']) {
      expect(hasHeadings13(s)).toBe(true);
    }
  });

  it('allows h4+, mid-line hashes, and blanks', () => {
    for (const s of ['#### h4', '##### h5', 'text #notitle', 'a # b', '###notitle', '']) {
      expect(hasHeadings13(s)).toBe(false);
    }
  });
});

describe('stripHeadings13', () => {
  it('removes the marker, including a bare ###, keeping h4+', () => {
    expect(stripHeadings13('### Title')).toBe('Title');
    expect(stripHeadings13('###')).toBe('');
    expect(stripHeadings13('## Sub\n#### Keep')).toBe('Sub\n#### Keep');
  });
});
