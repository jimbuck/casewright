import { describe, expect, it } from 'vitest';
import { MARKDOWN_PROFILES, getProfile, reindentLists } from './markdown-profile';

const cm = getProfile('commonmark');

describe('getProfile', () => {
  it('resolves each target to a 4-space content-aligned unit and falls back to commonmark', () => {
    for (const t of ['commonmark', 'azure-devops', 'github', 'gitlab'] as const) {
      expect(getProfile(t).indentUnit).toBe('    ');
    }
    expect(getProfile(undefined).id).toBe('commonmark');
  });

  it('lists the profiles in registry order for the picker', () => {
    expect(MARKDOWN_PROFILES.map((p) => p.id)).toEqual(['commonmark', 'azure-devops', 'github', 'gitlab']);
  });
});

describe('reindentLists', () => {
  it('returns body with no list markers unchanged', () => {
    const text = 'A paragraph.\n\n    indented code, not a list\n    more code';
    expect(reindentLists(text, cm)).toBe(text);
  });

  it('leaves a single-level list at column zero untouched', () => {
    const text = 'Use these values:\n- one\n- two\n- three';
    expect(reindentLists(text, cm)).toBe(text);
  });

  it('renormalizes nested bullets to the 4-space unit', () => {
    const input = '- a\n  - b\n    - c';
    expect(reindentLists(input, cm)).toBe('- a\n    - b\n        - c');
  });

  it('renormalizes nested ordered lists', () => {
    const input = '1. a\n   1. b';
    expect(reindentLists(input, cm)).toBe('1. a\n    1. b');
  });

  it('keeps a wrapped continuation aligned to its item and nests a following child', () => {
    const input = '- first line\n  wrapped continuation\n  - child';
    expect(reindentLists(input, cm)).toBe('- first line\n  wrapped continuation\n    - child');
  });

  it('shifts a fenced code block by the same delta as its list item', () => {
    const input = '- a\n  - b\n    ```\n    code\n    ```';
    expect(reindentLists(input, cm)).toBe('- a\n    - b\n      ```\n      code\n      ```');
  });

  it('keeps loose lists (blank line between items) intact', () => {
    const input = '- a\n\n  - b';
    expect(reindentLists(input, cm)).toBe('- a\n\n    - b');
  });

  it('does not treat list-marker-like content inside a fence as a list', () => {
    const input = '```\n- not a list item\n  - still code\n```';
    expect(reindentLists(input, cm)).toBe(input);
  });

  it('is idempotent', () => {
    const input = '- a\n  - b\n    1. c\n      wrapped';
    const once = reindentLists(input, cm);
    expect(reindentLists(once, cm)).toBe(once);
  });
});
