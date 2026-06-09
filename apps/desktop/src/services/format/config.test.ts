import { describe, expect, it } from 'vitest';
import { CASEWRIGHT_GITIGNORE, serializeConfigYaml } from './config';

describe('serializeConfigYaml', () => {
  it('emits version and an optional name', () => {
    expect(serializeConfigYaml({ version: 1, name: 'QA' })).toBe('version: 1\nname: QA\n');
    expect(serializeConfigYaml({ version: 2 })).toBe('version: 2\n');
  });

  it('omits a blank name', () => {
    expect(serializeConfigYaml({ version: 1, name: '   ' })).toBe('version: 1\n');
  });
});

describe('CASEWRIGHT_GITIGNORE', () => {
  it('ignores cache/', () => {
    expect(CASEWRIGHT_GITIGNORE).toMatch(/^cache\/$/m);
  });
});
