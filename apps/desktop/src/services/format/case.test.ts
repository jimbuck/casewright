import { describe, expect, it } from 'vitest';
import { cases } from '@/data/sample';
import type { Case } from '@/types';
import { parseCase, serializeCase, type ParsedCase } from './case';

const strip = (c: Case): ParsedCase => {
  const { suite: _s, modified: _m, ...rest } = c;
  return rest;
};

const PRD_CASE: ParsedCase = {
  id: '9f3a7c1e8b',
  displayId: 'PAY-0042',
  title: 'User can reset password from the login screen',
  status: 'active',
  tags: ['auth', 'smoke', 'regression'],
  objective:
    'Verify a registered user can reset their password and regain access via the\n**self-service** flow; no admin involvement required.',
  systems: ['Login web app', 'Auth service', 'Transactional email gateway'],
  setup: [
    {
      name: 'Test account',
      body: 'A registered user with a verified email and a **known** current password.',
    },
    { name: 'Inbox access', body: 'Access to the account inbox so the reset email can be opened.' },
  ],
  steps: [
    { text: 'Navigate to the login screen.', depth: 0 },
    { text: 'Click "Forgot password".', depth: 0 },
    { text: 'Confirm the recovery form is shown.', depth: 1 },
    { text: 'Enter the account email and submit.', depth: 0 },
  ],
  expected: [
    'A reset email is delivered within one minute.',
    'The reset link allows setting a new password.',
    'The user can log in with the new password.',
  ],
};

const PRD_CANONICAL = `---
id: 9f3a7c1e8b
displayId: PAY-0042
title: User can reset password from the login screen
status: active
tags: [auth, smoke, regression]
---

## Objective

Verify a registered user can reset their password and regain access via the
**self-service** flow; no admin involvement required.

## Systems in Scope

- Login web app
- Auth service
- Transactional email gateway

## Setup

### Test account

A registered user with a verified email and a **known** current password.

### Inbox access

Access to the account inbox so the reset email can be opened.

## Steps

1. Navigate to the login screen.
2. Click "Forgot password".
  1. Confirm the recovery form is shown.
3. Enter the account email and submit.

## Expected Results

- A reset email is delivered within one minute.
- The reset link allows setting a new password.
- The user can log in with the new password.
`;

describe('serializeCase', () => {
  it('produces the canonical PRD §5.2 form', () => {
    expect(serializeCase(PRD_CASE)).toBe(PRD_CANONICAL);
  });

  it('ends with exactly one trailing newline', () => {
    const out = serializeCase(PRD_CASE);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });

  it('emits all five sections even when empty', () => {
    const empty: ParsedCase = { ...PRD_CASE, objective: '', systems: [], setup: [], steps: [], expected: [] };
    const out = serializeCase(empty);
    for (const h of ['## Objective', '## Systems in Scope', '## Setup', '## Steps', '## Expected Results']) {
      expect(out).toContain(h);
    }
  });
});

describe('parseCase', () => {
  it('parses the canonical form back to the domain shape', () => {
    const { case: c, warnings } = parseCase(PRD_CANONICAL);
    expect(warnings).toHaveLength(0);
    expect(c).toEqual(PRD_CASE);
  });

  it('tolerates the markdown-natural (3-space) step indentation', () => {
    const md = PRD_CANONICAL.replace('  1. Confirm', '   1. Confirm');
    const { case: c } = parseCase(md);
    expect(c.steps[2]).toEqual({ text: 'Confirm the recovery form is shown.', depth: 1 });
  });

  it('generates an id and warns when front matter has none', () => {
    const md = PRD_CANONICAL.replace('id: 9f3a7c1e8b\n', '');
    const { case: c, warnings } = parseCase(md);
    expect(c.id).toMatch(/^[a-z0-9]{11}$/);
    expect(warnings.some((w) => w.code === 'missing-id')).toBe(true);
  });

  it('parses named setup items, including one with an empty body', () => {
    const md = PRD_CANONICAL.replace(
      '### Inbox access\n\nAccess to the account inbox so the reset email can be opened.',
      '### Inbox access',
    );
    const { case: c } = parseCase(md);
    expect(c.setup).toEqual([
      { name: 'Test account', body: 'A registered user with a verified email and a **known** current password.' },
      { name: 'Inbox access', body: '' },
    ]);
    // a body-less item round-trips as a bare `### heading`
    expect(serializeCase(c)).toContain('### Inbox access\n\n## Steps');
  });

  it('preserves out-of-schema content and warns', () => {
    const md = PRD_CANONICAL + '\n## Notes\n\nSome extra content.\n';
    const { extra, warnings } = parseCase(md);
    expect(extra).toContain('## Notes');
    expect(extra).toContain('Some extra content.');
    expect(warnings.some((w) => w.code === 'extra-content')).toBe(true);
    // round-trips: the extra is re-appended on serialize
    const round = parseCase(serializeCase(parseCase(md).case, extra));
    expect(round.extra).toContain('Some extra content.');
  });
});

describe('round-trip — every sample case', () => {
  it('serialize is idempotent', () => {
    for (const sample of cases) {
      const text = serializeCase(strip(sample));
      const reparsed = parseCase(text);
      expect(serializeCase(reparsed.case, reparsed.extra)).toBe(text);
    }
  });

  it('preserves the structured fields', () => {
    for (const sample of cases) {
      const c = strip(sample);
      const { case: parsed } = parseCase(serializeCase(c));
      expect(parsed.id).toBe(c.id);
      expect(parsed.displayId).toBe(c.displayId);
      expect(parsed.title).toBe(c.title);
      expect(parsed.status).toBe(c.status);
      expect(parsed.tags).toEqual(c.tags);
      expect(parsed.systems).toEqual(c.systems);
      expect(parsed.setup).toEqual(c.setup);
      expect(parsed.expected).toEqual(c.expected);
      expect(parsed.steps).toEqual(c.steps);
      expect(parsed.objective).toBe(c.objective.trim());
    }
  });
});
