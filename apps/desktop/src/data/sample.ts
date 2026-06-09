/* ============================================================
   Casewright — seed data (NOT app data)

   The running app reads real files from disk via the repo + git services; it no
   longer imports this module. This is the canonical seed for:
     • `scripts/make-fixture.mts` — materializes it into a real Git fixture repo
       (`.casewright/` layout: config.yaml + central runs/ + per-workspace casewright.yaml)
     • `services/format/*.test.ts` — serialize/parse round-trip tests
   The `conflict` export illustrates the merge model for the deferred 3-way engine.
   ============================================================ */
import type { Case, Conflict, Recent, Run, TreeNode, Workspace } from '@/types';

export const recents: Recent[] = [
  {
    name: 'qa-testcases',
    path: '~/work/acme/qa-testcases',
    branch: 'main',
    remote: 'ssh://git@ssh.dev.azure.com/v3/acme/QA/qa-testcases',
    lastOpened: '2026-06-08T12:00:00.000Z',
    workspaces: 2,
    lastWorkspaceId: 'payments',
  },
];

export const workspaces: Workspace[] = [
  {
    id: 'payments',
    name: 'Payments QA',
    path: 'areas/payments',
    description: 'Manual test cases for the billing and payments area.',
    prefix: 'PAY',
  },
  {
    id: 'onboarding',
    name: 'Onboarding',
    path: 'areas/onboarding',
    description: 'Sign-up, activation and first-run flows.',
    prefix: 'ONB',
  },
];

export const cases: Case[] = [
  {
    id: '9f3a7c1e8b',
    displayId: 'PAY-0042',
    suite: 'auth',
    title: 'User can reset password from the login screen',
    status: 'active',
    tags: ['Auth', 'Smoke', 'Regression'],
    objective:
      'Verify a registered user can reset their password and regain access via the **self-service** flow; no admin involvement required.',
    systems: ['Login web app', 'Auth service', 'Transactional email gateway'],
    setup: [
      {
        name: 'Test account',
        body: 'A registered user with a verified email and a **known** current password.',
      },
      {
        name: 'Inbox access',
        body: 'Access to the account inbox so the reset email can be opened.',
      },
    ],
    steps: [
      { text: 'Navigate to the login screen.', depth: 0 },
      { text: 'Click "Forgot password".', depth: 0 },
      { text: 'Confirm the recovery form is shown.', depth: 1 },
      { text: 'Enter the account email and submit.', depth: 0 },
      { text: 'Open the reset link from the email.', depth: 0 },
      { text: 'Set a new password meeting the policy.', depth: 0 },
    ],
    expected: [
      'A reset email is delivered within one minute.',
      'The reset link allows setting a new password.',
      'The user can log in with the new password.',
    ],
    modified: false,
  },
  {
    id: 'c4d8e012af',
    displayId: 'PAY-0043',
    suite: 'auth',
    title: 'Account locks after five failed sign-in attempts',
    status: 'active',
    tags: ['Auth', 'Security', 'Regression'],
    objective:
      'Confirm the lockout policy engages after repeated failures and communicates a clear recovery path to the user.',
    systems: ['Login web app', 'Auth service', 'Rate limiter'],
    setup: [],
    steps: [
      { text: 'Submit an incorrect password five times in a row.', depth: 0 },
      { text: 'Observe the lockout message on the sixth attempt.', depth: 0 },
      { text: 'Wait for the cool-down window to elapse.', depth: 0 },
    ],
    expected: [
      'Sign-in is blocked after the fifth failure.',
      'A lockout notice with recovery guidance is shown.',
      'Access is restored after the cool-down window.',
    ],
    modified: false,
  },
  {
    id: '7b22aa90d1',
    displayId: 'PAY-0051',
    suite: 'sessions',
    title: 'Idle session expires and prompts re-authentication',
    status: 'active',
    tags: ['Auth', 'Sessions'],
    objective:
      'An idle session must expire on schedule and require re-authentication without losing unsaved draft data.',
    systems: ['Login web app', 'Session service'],
    setup: [],
    steps: [
      { text: 'Sign in and leave the tab idle past the timeout.', depth: 0 },
      { text: 'Attempt a privileged action.', depth: 0 },
      { text: 'Re-authenticate when prompted.', depth: 0 },
    ],
    expected: [
      'The session expires at the configured idle window.',
      'A re-authentication prompt appears.',
      'Unsaved drafts are preserved after re-auth.',
    ],
    modified: false,
  },
  {
    id: 'e019b7c33a',
    displayId: 'PAY-0088',
    suite: 'billing',
    title: 'Coupon applies a percentage discount at checkout',
    status: 'active',
    tags: ['Billing', 'Smoke', 'Regression'],
    objective:
      'A valid percentage coupon should reduce the order total correctly and reflect in the receipt.',
    systems: ['Checkout web app', 'Pricing service', 'Billing ledger'],
    setup: [
      {
        name: 'Active coupon',
        body: 'A valid percentage coupon configured in the pricing service.\nIt must not be expired or usage-capped.',
      },
    ],
    steps: [
      { text: 'Add a paid plan to the cart.', depth: 0 },
      { text: 'Enter a valid percentage coupon.', depth: 0 },
      { text: 'Confirm the discount line appears.', depth: 1 },
      { text: 'Complete the purchase.', depth: 0 },
    ],
    expected: [
      'The discount is applied to the subtotal.',
      'The receipt itemizes the coupon.',
      'The billing ledger records the net charge.',
    ],
    modified: false,
  },
  {
    id: 'a8f1029ce5',
    displayId: 'PAY-0090',
    suite: 'billing',
    title: 'Declined card surfaces an actionable error',
    status: 'draft',
    tags: ['Billing', 'Payments'],
    objective:
      'When a card is declined the user must see a clear, recoverable error and the order must not be created.',
    systems: ['Checkout web app', 'Payment gateway'],
    setup: [],
    steps: [
      { text: 'Enter a card number that the gateway declines.', depth: 0 },
      { text: 'Attempt to pay.', depth: 0 },
    ],
    expected: ['A clear decline message is shown.', 'No order or charge is created.'],
    modified: false,
  },
  {
    id: '12be77a4c0',
    displayId: 'PAY-0091',
    suite: 'billing',
    title: 'Refund returns funds to the original payment method',
    status: 'active',
    tags: ['Billing', 'Refunds', 'Regression'],
    objective:
      'A refund issued from the admin should return funds to the original method and update the ledger and receipt.',
    systems: ['Admin console', 'Payment gateway', 'Billing ledger'],
    setup: [],
    steps: [
      { text: 'Locate a settled charge in the admin console.', depth: 0 },
      { text: 'Issue a full refund.', depth: 0 },
      { text: 'Confirm the ledger entry and notification.', depth: 0 },
    ],
    expected: [
      'Funds return to the original payment method.',
      'The ledger shows a matching refund entry.',
      'The customer receives a refund notification.',
    ],
    modified: false,
  },
  {
    id: '5d6e9981bb',
    displayId: 'PAY-0102',
    suite: 'subs',
    title: 'Plan upgrade prorates the remaining period',
    status: 'active',
    tags: ['Billing', 'Subscriptions', 'Regression'],
    objective:
      'Upgrading mid-cycle must charge a prorated amount for the remainder of the billing period.',
    systems: ['Account settings', 'Pricing service', 'Billing ledger'],
    setup: [],
    steps: [
      { text: 'Open plan settings on an active subscription.', depth: 0 },
      { text: 'Select a higher tier and confirm.', depth: 0 },
      { text: 'Review the prorated charge preview.', depth: 1 },
    ],
    expected: [
      'A prorated charge for the remaining period is shown.',
      'The new tier is effective immediately.',
    ],
    modified: false,
  },
  {
    id: 'f7710c2ad9',
    displayId: 'PAY-0103',
    suite: 'subs',
    title: 'Cancellation takes effect at period end',
    status: 'deprecated',
    tags: ['Subscriptions'],
    objective:
      'A standard cancellation should keep access until the end of the paid period, then stop renewal.',
    systems: ['Account settings', 'Billing ledger'],
    setup: [],
    steps: [
      { text: 'Cancel an active subscription.', depth: 0 },
      { text: 'Confirm access continues until period end.', depth: 0 },
    ],
    expected: ['Access remains until the period end date.', 'No further renewal is charged.'],
    modified: false,
  },

  /* ---- Onboarding workspace (ONB) — gives runs cases from a second workspace ---- */
  {
    id: 'b1c0de4471',
    displayId: 'ONB-0001',
    suite: 'activation',
    title: 'New user verifies their email during sign-up',
    status: 'active',
    tags: ['Onboarding', 'Smoke', 'Regression'],
    objective: 'A new sign-up must confirm their email before the account is fully activated.',
    systems: ['Sign-up web app', 'Auth service', 'Transactional email gateway'],
    setup: [],
    steps: [
      { text: 'Complete the sign-up form with a new email.', depth: 0 },
      { text: 'Open the verification email and click the link.', depth: 0 },
      { text: 'Confirm the account is marked active.', depth: 1 },
    ],
    expected: [
      'A verification email arrives within one minute.',
      'Clicking the link activates the account.',
    ],
    modified: false,
  },
  {
    id: 'd5e6f70982',
    displayId: 'ONB-0002',
    suite: 'activation',
    title: 'Welcome checklist guides the first three actions',
    status: 'active',
    tags: ['Onboarding', 'Regression'],
    objective: 'The first-run checklist should orient a new user and track completion.',
    systems: ['Onboarding web app'],
    setup: [],
    steps: [
      { text: 'Sign in as a brand-new user.', depth: 0 },
      { text: 'Complete each checklist item.', depth: 0 },
    ],
    expected: ['The checklist tracks completion.', 'It disappears once all items are done.'],
    modified: false,
  },
  {
    id: 'a3b4c5d6e7',
    displayId: 'ONB-0007',
    suite: 'invites',
    title: 'Team invite email lets a colleague join the workspace',
    status: 'draft',
    tags: ['Onboarding', 'Invites'],
    objective: 'An invited colleague can accept and land in the correct workspace.',
    systems: ['Sign-up web app', 'Transactional email gateway'],
    setup: [],
    steps: [
      { text: 'Send an invite to a colleague’s email.', depth: 0 },
      { text: 'Accept the invite from the email.', depth: 0 },
    ],
    expected: ['The invite email is delivered.', 'Accepting joins the inviting workspace.'],
    modified: false,
  },
];

/** Per-workspace suite/case subtree, keyed by workspace id (materialized under each workspace path). */
export const trees: Record<string, TreeNode[]> = {
  payments: [
    {
      type: 'suite',
      id: 'auth',
      name: 'Authentication',
      path: 'Authentication',
      children: [
        { type: 'case', id: '9f3a7c1e8b' },
        { type: 'case', id: 'c4d8e012af' },
        {
          type: 'suite',
          id: 'sessions',
          name: 'Sessions',
          path: 'Authentication/Sessions',
          children: [{ type: 'case', id: '7b22aa90d1' }],
        },
      ],
    },
    {
      type: 'suite',
      id: 'billing',
      name: 'Billing',
      path: 'Billing',
      children: [
        { type: 'case', id: 'e019b7c33a' },
        { type: 'case', id: 'a8f1029ce5' },
        { type: 'case', id: '12be77a4c0' },
      ],
    },
    {
      type: 'suite',
      id: 'subs',
      name: 'Subscriptions',
      path: 'Subscriptions',
      children: [
        { type: 'case', id: '5d6e9981bb' },
        { type: 'case', id: 'f7710c2ad9' },
      ],
    },
  ],
  onboarding: [
    {
      type: 'suite',
      id: 'activation',
      name: 'Activation',
      path: 'Activation',
      children: [
        { type: 'case', id: 'b1c0de4471' },
        { type: 'case', id: 'd5e6f70982' },
      ],
    },
    {
      type: 'suite',
      id: 'invites',
      name: 'Invites',
      path: 'Invites',
      children: [{ type: 'case', id: 'a3b4c5d6e7' }],
    },
  ],
};

export const runs: Run[] = [
  {
    id: '.casewright/runs/2026-06-05-release-readiness',
    name: 'Release readiness — cross-team',
    file: '.casewright/runs/2026-06-05-release-readiness.csv',
    created: '2026-06-05',
    status: 'open',
    scope: 'repo',
    rows: [
      { case_id: '9f3a7c1e8b', display_id: 'PAY-0042', title: 'User can reset password from the login screen', result: 'pass', tester: 'amartin', executed_at: '2026-06-05 09:10', notes: '' },
      { case_id: 'e019b7c33a', display_id: 'PAY-0088', title: 'Coupon applies a percentage discount at checkout', result: 'pass', tester: 'amartin', executed_at: '2026-06-05 09:24', notes: '' },
      { case_id: 'b1c0de4471', display_id: 'ONB-0001', title: 'New user verifies their email during sign-up', result: 'pass', tester: 'okeefe', executed_at: '2026-06-05 09:40', notes: '' },
      { case_id: 'a3b4c5d6e7', display_id: 'ONB-0007', title: 'Team invite email lets a colleague join the workspace', result: 'not_run', tester: '', executed_at: '', notes: '' },
    ],
  },
  {
    id: '.casewright/runs/2026-06-01-regression-sprint12',
    name: 'Regression — Sprint 12',
    file: '.casewright/runs/2026-06-01-regression-sprint12.csv',
    created: '2026-06-01',
    status: 'open',
    scope: 'tag: Regression',
    rows: [
      { case_id: '9f3a7c1e8b', display_id: 'PAY-0042', title: 'User can reset password from the login screen', result: 'pass', tester: 'amartin', executed_at: '2026-06-01 09:14', notes: '' },
      { case_id: 'c4d8e012af', display_id: 'PAY-0043', title: 'Account locks after five failed sign-in attempts', result: 'pass', tester: 'amartin', executed_at: '2026-06-01 09:31', notes: '' },
      { case_id: 'e019b7c33a', display_id: 'PAY-0088', title: 'Coupon applies a percentage discount at checkout', result: 'fail', tester: 'jpatel', executed_at: '2026-06-01 10:02', notes: 'DEF-2291 — discount rounds down by 1 cent' },
      { case_id: '12be77a4c0', display_id: 'PAY-0091', title: 'Refund returns funds to the original payment method', result: 'blocked', tester: 'jpatel', executed_at: '2026-06-01 10:20', notes: 'gateway sandbox down' },
      { case_id: '5d6e9981bb', display_id: 'PAY-0102', title: 'Plan upgrade prorates the remaining period', result: 'not_run', tester: '', executed_at: '', notes: '' },
    ],
  },
  {
    id: '.casewright/runs/2026-05-18-smoke',
    name: 'Smoke — pre-release',
    file: '.casewright/runs/2026-05-18-smoke.csv',
    created: '2026-05-18',
    status: 'closed',
    scope: 'tag: Smoke',
    rows: [
      { case_id: '9f3a7c1e8b', display_id: 'PAY-0042', title: 'User can reset password from the login screen', result: 'pass', tester: 'amartin', executed_at: '2026-05-18 16:40', notes: '' },
      { case_id: 'e019b7c33a', display_id: 'PAY-0088', title: 'Coupon applies a percentage discount at checkout', result: 'pass', tester: 'amartin', executed_at: '2026-05-18 16:52', notes: '' },
      { case_id: 'b1c0de4471', display_id: 'ONB-0001', title: 'New user verifies their email during sign-up', result: 'pass', tester: 'okeefe', executed_at: '2026-05-18 17:05', notes: '' },
    ],
  },
];

// ============================================================
// Conflict scenario — produced by a Pull. Mix of auto-merged
// elements (one-sided) and true conflicts (changed on both sides).
// Drives the structured merge resolver.
// ============================================================
export const conflict: Conflict = {
  branch: 'main',
  behind: 3,
  ahead: 1,
  files: [
    {
      kind: 'case',
      path: 'areas/payments/Authentication/reset-password.md',
      displayId: 'PAY-0042',
      caseId: '9f3a7c1e8b',
      title: 'User can reset password from the login screen',
      elements: [
        {
          key: 'title',
          label: 'Title',
          kind: 'field',
          base: 'User can reset password from the login screen',
          ours: 'User can reset password from the login screen',
          theirs: 'User can reset their password from the login screen',
          auto: 'theirs',
          reason: 'Changed only on incoming (theirs).',
        },
        { key: 'status', label: 'Status', kind: 'field', base: 'active', ours: 'active', theirs: 'active', auto: 'same' },
        {
          key: 'tags',
          label: 'Tags',
          kind: 'tags',
          base: ['Auth', 'Smoke', 'Regression'],
          ours: ['Auth', 'Smoke', 'Regression', 'P1'],
          theirs: ['Auth', 'Smoke', 'Regression', 'Email'],
          auto: 'merge',
          merged: ['Auth', 'Smoke', 'Regression', 'P1', 'Email'],
          reason: 'Set merge: both additions kept (P1 + Email).',
        },
        {
          key: 'objective',
          label: 'Objective',
          kind: 'prose',
          conflict: true,
          base: 'Verify a registered user can reset their password and regain access via the **self-service** flow; no admin involvement required.',
          ours: 'Verify a registered user can reset their password and regain access via the **self-service** flow within two minutes; no admin involvement required.',
          theirs: 'Verify a registered user can reset their password and regain access through the **self-service** recovery flow; no admin or support involvement required.',
          reason: 'Changed on both sides — choose one or edit.',
        },
        {
          key: 'systems',
          label: 'Systems in Scope',
          kind: 'list',
          base: ['Login web app', 'Auth service', 'Transactional email gateway'],
          ours: ['Login web app', 'Auth service', 'Transactional email gateway'],
          theirs: ['Login web app', 'Auth service', 'Transactional email gateway', 'Notification service'],
          auto: 'theirs',
          reason: 'Changed only on incoming (added Notification service).',
        },
        {
          key: 'steps',
          label: 'Steps',
          kind: 'steps',
          conflict: true,
          base: [
            { text: 'Navigate to the login screen.', depth: 0 },
            { text: 'Click "Forgot password".', depth: 0 },
            { text: 'Enter the account email and submit.', depth: 0 },
          ],
          ours: [
            { text: 'Navigate to the login screen.', depth: 0 },
            { text: 'Click "Forgot password".', depth: 0 },
            { text: 'Confirm the recovery form is shown.', depth: 1 },
            { text: 'Enter the account email and submit.', depth: 0 },
          ],
          theirs: [
            { text: 'Open the login screen.', depth: 0 },
            { text: 'Select "Forgot password".', depth: 0 },
            { text: 'Enter the account email.', depth: 0 },
            { text: 'Submit the recovery request.', depth: 0 },
          ],
          reason: 'Changed on both sides — choose one or edit.',
        },
        {
          key: 'expected',
          label: 'Expected Results',
          kind: 'list',
          base: ['A reset email is delivered within one minute.', 'The reset link allows setting a new password.', 'The user can log in with the new password.'],
          ours: ['A reset email is delivered within one minute.', 'The reset link allows setting a new password.', 'The user can log in with the new password.'],
          theirs: ['A reset email is delivered within one minute.', 'The reset link allows setting a new password.', 'The user can log in with the new password.'],
          auto: 'same',
        },
      ],
    },
    {
      kind: 'case',
      path: 'areas/payments/Billing/coupon-discount.md',
      displayId: 'PAY-0088',
      caseId: 'e019b7c33a',
      title: 'Coupon applies a percentage discount at checkout',
      elements: [
        { key: 'title', label: 'Title', kind: 'field', base: 'Coupon applies a percentage discount at checkout', ours: 'Coupon applies a percentage discount at checkout', theirs: 'Coupon applies a percentage discount at checkout', auto: 'same' },
        { key: 'displayId', label: 'Display ID', kind: 'field', base: 'PAY-0088', ours: 'PAY-0088', theirs: 'PAY-0088', auto: 'same' },
        { key: 'status', label: 'Status', kind: 'field', base: 'draft', ours: 'active', theirs: 'draft', auto: 'ours', reason: 'Changed only locally (ours) to active.' },
        {
          key: 'expected',
          label: 'Expected Results',
          kind: 'list',
          conflict: true,
          base: ['The discount is applied to the subtotal.', 'The receipt itemizes the coupon.', 'The billing ledger records the net charge.'],
          ours: ['The discount is applied to the subtotal before tax.', 'The receipt itemizes the coupon.', 'The billing ledger records the net charge.'],
          theirs: ['The discount is applied to the subtotal.', 'The receipt itemizes the coupon line.', 'The billing ledger records the net charge.', 'An audit event is emitted.'],
          reason: 'Changed on both sides — choose one or edit.',
        },
      ],
    },
    {
      kind: 'run',
      path: '.casewright/runs/2026-06-01-regression-sprint12.csv',
      title: 'Regression — Sprint 12',
      rows: [
        { case_id: '9f3a7c1e8b', display_id: 'PAY-0042', auto: 'same', value: { result: 'pass', tester: 'amartin', notes: '' } },
        { case_id: 'c4d8e012af', display_id: 'PAY-0043', auto: 'theirs', reason: 'Result recorded only on incoming.', value: { result: 'pass', tester: 'okeefe', notes: '' } },
        {
          case_id: 'e019b7c33a',
          display_id: 'PAY-0088',
          conflict: true,
          base: { result: 'not_run', tester: '', notes: '' },
          ours: { result: 'fail', tester: 'jpatel', notes: 'DEF-2291 — discount rounds down by 1 cent' },
          theirs: { result: 'blocked', tester: 'okeefe', notes: 'pricing sandbox unavailable' },
          reason: 'Result recorded differently on both sides.',
        },
      ],
    },
  ],
};
