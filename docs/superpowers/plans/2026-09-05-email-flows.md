# Email Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every TSW email a shared branded template, send a welcome email on signup, and finish the half-wired email-verification and Google-account flows.

**Architecture:** One renderer (`email.template.js`) returns `{ html, text }` from a single call so the two bodies cannot drift. `email.service.js` keeps its per-email functions but builds bodies through that renderer. Auth gains three sends it was missing: welcome (local + Google), verification-resend, and a "you sign in with Google" reply to forgot-password.

**Tech Stack:** Node 20, Express 4, Mongoose, Resend SDK 6.12.4, Jest + Supertest (server), Vitest + React Testing Library (client).

**Spec:** [`docs/superpowers/specs/2026-09-05-email-flows-design.md`](../specs/2026-09-05-email-flows-design.md)

## Global Constraints

- **No images in any email.** No `<img>`, no SVG, no tracking pixel. Four of Resend's eight deliverability checks depend on this.
- **Every send passes both `text` and `html`.** Never one without the other.
- **All links point at `thesportyway.com`** (via `CLIENT_ORIGIN`). No shorteners, no third-party domains.
- **Sends stay fire-and-forget** through `sendTemplateEmailAsync` (OPT-020). Never `await` a send in a request path.
- **Escape user-supplied values in the HTML branch only.** Plain text has no markup to inject into.
- **`forgotPassword` must return an identical response** for all three branches (local / Google / unknown). It must not become an account-existence oracle.
- **Server tests:** `pnpm --filter server test`. **Client tests:** `pnpm --filter client test`. Never Jest on the client or Vitest on the server.
- **Conventional commits** (commitlint + Husky enforce this).
- **DO NOT RUN `git commit`.** The user commits manually. **Skip the final "Commit" step of every
  task** and leave the changes in the working tree. The commit commands are retained below only as a
  record of how the work should eventually be grouped. `git add` is fine; `git commit` is not.

---

## File Structure

| File                                                      | Responsibility                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `server/src/services/email.template.js`                   | **New.** `renderEmail()` — the only place email markup exists.                          |
| `server/src/tests/unit/email.template.test.js`            | **New.** Renderer unit tests.                                                           |
| `server/src/services/email.service.js`                    | Modify. Per-email functions; bodies come from the renderer. Local `escapeHtml` deleted. |
| `server/src/modules/auth/auth.service.js`                 | Modify. Verification issuance, welcome sends, Google forgot-password branch.            |
| `server/src/modules/contact/contact.routes.js`            | Modify. Contact email through the renderer.                                             |
| `server/src/tests/unit/auth.service.test.js`              | Modify. New assertions for the new sends.                                               |
| `server/src/tests/integration/contact.test.js`            | Modify. Updated body-shape assertions.                                                  |
| `client/src/features/auth/pages/VerifyEmailPage.jsx`      | Modify. Auto-verify from the URL token, then redirect to `/onboarding`.                 |
| `client/src/features/auth/pages/VerifyEmailPage.test.jsx` | **New.** Auto-verify and redirect tests.                                                |
| `docs/email-delivery.md`                                  | Modify. Outstanding list refreshed.                                                     |

---

### Task 1: Shared email template renderer

**Files:**

- Create: `server/src/services/email.template.js`
- Test: `server/src/tests/unit/email.template.test.js`

**Interfaces:**

- Consumes: `escapeHtml` from `server/src/utils/escapeHtml.js`.
- Produces: `renderEmail({ preheader, greeting, paragraphs, cta, footnote }) -> { html, text }`.
  `cta` is `{ label: string, url: string } | null`. `paragraphs` is `string[]`. `greeting` and
  `preheader` are strings; `footnote` is `string | null`.

- [ ] **Step 1: Write the failing test**

Create `server/src/tests/unit/email.template.test.js`:

```js
const { renderEmail } = require('../../services/email.template');

describe('renderEmail', () => {
  test('renders the CTA url in both the html and text bodies', () => {
    const { html, text } = renderEmail({
      preheader: 'Reset your password',
      greeting: 'Hi Simon,',
      paragraphs: ['Someone asked to reset your password.'],
      cta: { label: 'Reset password', url: 'https://thesportyway.com/reset-password?token=abc' },
      footnote: 'This link expires in 30 minutes.',
    });

    expect(html).toContain('https://thesportyway.com/reset-password?token=abc');
    expect(text).toContain('https://thesportyway.com/reset-password?token=abc');
    expect(text).toContain('Reset password:');
  });

  test('never emits an image, which would fail Resend deliverability checks', () => {
    const { html } = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body copy.'],
      cta: { label: 'Go', url: 'https://thesportyway.com' },
    });

    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/\.svg/i);
  });

  test('escapes user values in html but leaves text raw', () => {
    const { html, text } = renderEmail({
      greeting: 'Hi <img src=x onerror=alert(1)>,',
      paragraphs: ['Club & <b>Bold</b>'],
      cta: null,
    });

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
    expect(html).toContain('Club &amp; &lt;b&gt;Bold&lt;/b&gt;');
    expect(text).toContain('Club & <b>Bold</b>');
  });

  test('omits the button entirely when cta is null', () => {
    const withCta = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: { label: 'Reset password', url: 'https://thesportyway.com/reset' },
    });
    const withoutCta = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: null,
    });

    expect(withCta.html).toContain('Reset password');
    expect(withCta.text).toContain('Reset password: https://thesportyway.com/reset');

    // The footer always links to the site, so this asserts the CTA specifically
    // is gone rather than that the email contains no links at all.
    expect(withoutCta.html).not.toContain('Reset password');
    expect(withoutCta.text).not.toContain('Reset password');
    expect(withoutCta.html).not.toContain('/reset');
  });

  test('includes the brand footer in both bodies', () => {
    const { html, text } = renderEmail({
      greeting: 'Hi there,',
      paragraphs: ['Body.'],
      cta: null,
    });

    expect(html).toContain('thesportyway.com');
    expect(text).toContain('The Sporty Way');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && ENV_FILE=../env/server/.env.development npx jest src/tests/unit/email.template.test.js`
Expected: FAIL — `Cannot find module '../../services/email.template'`

- [ ] **Step 3: Write minimal implementation**

Create `server/src/services/email.template.js`:

```js
const { escapeHtml } = require('../utils/escapeHtml');

// The single source of email markup. Every send renders through this so the
// HTML and plain-text bodies cannot drift apart — previously each function
// hand-wrote both and nothing kept them in step.
//
// Constraints that look cosmetic but are not:
//   * Table layout + inline CSS — email clients strip <style> and have no
//     flexbox or grid.
//   * No images of any kind. Four of Resend's deliverability checks depend on
//     it, and the design must survive images being blocked, which is the
//     default in Outlook and much of Gmail.
const BRAND = {
  name: 'The Sporty Way',
  url: 'https://thesportyway.com',
  accent: '#059669', // emerald-600
  text: '#0f172a', // slate-900
  muted: '#64748b', // slate-500
  border: '#e2e8f0', // slate-200
  page: '#f8fafc', // slate-50
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function renderButton(cta) {
  if (!cta) return '';
  return `
      <tr>
        <td style="padding:8px 0 24px 0;">
          <a href="${encodeURI(cta.url)}" style="background-color:${BRAND.accent};border-radius:6px;color:#ffffff;display:inline-block;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;padding:14px 24px;text-decoration:none;">${escapeHtml(cta.label)}</a>
        </td>
      </tr>`;
}

function renderEmail({
  preheader = '',
  greeting = 'Hi there,',
  paragraphs = [],
  cta = null,
  footnote = null,
}) {
  const bodyRows = paragraphs
    .map(
      (paragraph) =>
        `      <tr><td style="font-family:${FONT};font-size:15px;line-height:1.6;color:${BRAND.text};padding:0 0 16px 0;">${escapeHtml(paragraph)}</td></tr>`
    )
    .join('\n');

  const footnoteRow = footnote
    ? `      <tr><td style="font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.muted};padding:0 0 8px 0;">${escapeHtml(footnote)}</td></tr>`
    : '';

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background-color:${BRAND.page};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.page};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid ${BRAND.border};border-radius:8px;">
          <tr>
            <td style="padding:20px 28px;border-bottom:1px solid ${BRAND.border};font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.accent};">${BRAND.name}</td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="font-family:${FONT};font-size:15px;line-height:1.6;color:${BRAND.text};padding:0 0 16px 0;">${escapeHtml(greeting)}</td></tr>
${bodyRows}
${renderButton(cta)}
${footnoteRow}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;border-top:1px solid ${BRAND.border};font-family:${FONT};font-size:12px;color:${BRAND.muted};">
              <a href="${BRAND.url}" style="color:${BRAND.muted};text-decoration:underline;">thesportyway.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Plain text is not a courtesy — Resend's advisor checks for it, and a text
  // part is what renders when a client refuses HTML. The CTA becomes a labelled
  // URL so the link stays reachable.
  const textParts = [greeting, '', ...paragraphs];
  if (cta) textParts.push('', `${cta.label}: ${cta.url}`);
  if (footnote) textParts.push('', footnote);
  textParts.push('', `— ${BRAND.name}`, BRAND.url);

  return { html, text: textParts.join('\n') };
}

module.exports = { renderEmail };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && ENV_FILE=../env/server/.env.development npx jest src/tests/unit/email.template.test.js`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add server/src/services/email.template.js server/src/tests/unit/email.template.test.js
git commit -m "feat(email): add shared email template renderer"
```

---

### Task 2: Route existing emails through the renderer

**Files:**

- Modify: `server/src/services/email.service.js`

**Interfaces:**

- Consumes: `renderEmail` from Task 1.
- Produces: unchanged public signatures for `sendVerificationEmail({ to, name, verifyUrl })`,
  `sendPasswordResetEmail({ to, name, resetUrl })`, `sendPaymentFailedEmail({ to, name, resourceLabel, manageUrl })`,
  `sendTrialEndingEmail({ to, name, resourceLabel, trialEndsAt, manageUrl })`. Adds
  `sendWelcomeEmail({ to, name, ctaUrl, needsVerification })` and
  `sendGoogleAccountEmail({ to, name, loginUrl })`.

- [ ] **Step 1: Write the failing test**

In `server/src/tests/unit/email.service.test.js`, extend the existing top-level require so the two
new functions are in scope:

```js
const {
  sendTemplateEmail,
  sendTemplateEmailAsync,
  sendPasswordResetEmail,
  sendWelcomeEmail,
} = require('../../services/email.service');
```

Then append:

```js
describe('templates render through the shared renderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ error: null });
  });

  test('password reset carries the link in both bodies and emits no images', async () => {
    sendPasswordResetEmail({
      to: 'player@example.com',
      name: 'Simon',
      resetUrl: 'https://thesportyway.com/reset-password?token=abc',
    });
    await flushMicrotasksAndImmediate();

    const payload = mockSend.mock.calls[0][0];
    expect(payload.html).toContain('https://thesportyway.com/reset-password?token=abc');
    expect(payload.text).toContain('https://thesportyway.com/reset-password?token=abc');
    expect(payload.html).not.toMatch(/<img/i);
    expect(payload.html).toContain('The Sporty Way');
  });

  test('a Google welcome has no verify link and no expiry footnote', async () => {
    sendWelcomeEmail({
      to: 'g@example.com',
      name: 'Google User',
      ctaUrl: 'https://thesportyway.com/onboarding',
      needsVerification: false,
    });
    await flushMicrotasksAndImmediate();

    const payload = mockSend.mock.calls[0][0];
    expect(payload.subject).toBe('Welcome to The Sporty Way');
    expect(payload.text).toContain('https://thesportyway.com/onboarding');
    expect(payload.text).not.toContain('expires');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && ENV_FILE=../env/server/.env.development npx jest src/tests/unit/email.service.test.js`
Expected: FAIL — `Cannot find module '../../services/email.template'` if Task 1 is not merged; otherwise PASS and you may skip to Step 3.

- [ ] **Step 3: Write minimal implementation**

In `server/src/services/email.service.js`:

1. Add at the top, after the `logger` require:

```js
const { renderEmail } = require('./email.template');
```

2. **Delete** the local `escapeHtml` function (currently lines 12–20) and its `// Audit M14` comment block. Nothing else in this file will call it after this task.

3. Replace `sendVerificationEmail`, `sendPasswordResetEmail`, `sendPaymentFailedEmail` and `sendTrialEndingEmail` with:

```js
function sendVerificationEmail({ to, name, verifyUrl }) {
  const { html, text } = renderEmail({
    preheader: 'Confirm your email address',
    greeting: `Hi ${name || 'there'},`,
    paragraphs: ['Confirm this email address to finish setting up your account.'],
    cta: { label: 'Confirm email', url: verifyUrl },
    footnote: 'If you did not create an account, you can ignore this email.',
  });

  sendTemplateEmailAsync({
    to,
    subject: 'Confirm your email',
    text,
    html,
    fallbackLabel: 'email_verification',
  });
}

function sendPasswordResetEmail({ to, name, resetUrl }) {
  const { html, text } = renderEmail({
    preheader: 'Reset your password',
    greeting: `Hi ${name || 'there'},`,
    paragraphs: ['Someone asked to reset the password for this account.'],
    cta: { label: 'Reset password', url: resetUrl },
    footnote: 'If you did not ask for this, you can ignore this email — nothing has changed.',
  });

  sendTemplateEmailAsync({
    to,
    subject: 'Reset your password',
    text,
    html,
    fallbackLabel: 'password_reset',
  });
}

// Welcome (local signup carries a verify link; Google signup goes straight to
// onboarding because Google has already confirmed the address).
function sendWelcomeEmail({ to, name, ctaUrl, needsVerification }) {
  const { html, text } = renderEmail({
    preheader: 'Welcome to The Sporty Way',
    greeting: `Hi ${name || 'there'},`,
    paragraphs: [
      'Welcome to The Sporty Way. Your account is ready and you are already signed in.',
      needsVerification
        ? 'Confirm your email address and we will take you straight to setting up your first team or league.'
        : 'Set up your first team or league and start tracking games.',
    ],
    cta: {
      label: needsVerification ? 'Confirm and get started' : 'Get started',
      url: ctaUrl,
    },
    footnote: needsVerification ? 'This link expires in 60 minutes.' : null,
  });

  sendTemplateEmailAsync({
    to,
    subject: 'Welcome to The Sporty Way',
    text,
    html,
    fallbackLabel: 'welcome',
  });
}

// Sent when someone asks to reset a password on an account that signs in with
// Google. Without it that request is a silent dead end: there is no password to
// reset, so nothing was ever sent. The on-screen response is unchanged, so this
// tells only the true mailbox owner anything.
function sendGoogleAccountEmail({ to, name, loginUrl }) {
  const { html, text } = renderEmail({
    preheader: 'This account signs in with Google',
    greeting: `Hi ${name || 'there'},`,
    paragraphs: [
      'Someone asked to reset the password for this address.',
      'This account signs in with Google, so there is no password to reset. Use "Continue with Google" on the sign-in page.',
    ],
    cta: { label: 'Go to sign in', url: loginUrl },
    footnote: 'If you did not ask for this, you can ignore this email — nothing has changed.',
  });

  sendTemplateEmailAsync({
    to,
    subject: 'Signing in to The Sporty Way',
    text,
    html,
    fallbackLabel: 'google_account_notice',
  });
}

function sendPaymentFailedEmail({ to, name, resourceLabel, manageUrl }) {
  if (!to) return;
  const what = resourceLabel || 'your subscription';
  const { html, text } = renderEmail({
    preheader: 'Your payment failed',
    greeting: `Hi ${name || 'there'},`,
    paragraphs: [
      `The latest payment for ${what} failed.`,
      'Update your payment method to keep the subscription active.',
    ],
    cta: manageUrl ? { label: 'Update payment method', url: manageUrl } : null,
  });

  sendTemplateEmailAsync({
    to,
    subject: 'Your payment failed',
    text,
    html,
    fallbackLabel: 'billing_payment_failed',
  });
}

function sendTrialEndingEmail({ to, name, resourceLabel, trialEndsAt, manageUrl }) {
  if (!to) return;
  const what = resourceLabel || 'your subscription';
  const when = trialEndsAt ? `on ${new Date(trialEndsAt).toDateString()}` : 'soon';
  const { html, text } = renderEmail({
    preheader: 'Your free trial is ending soon',
    greeting: `Hi ${name || 'there'},`,
    paragraphs: [
      `Your free trial for ${what} ends ${when}.`,
      'Add a payment method to keep managing your league.',
    ],
    cta: manageUrl ? { label: 'Manage subscription', url: manageUrl } : null,
  });

  sendTemplateEmailAsync({
    to,
    subject: 'Your free trial is ending soon',
    text,
    html,
    fallbackLabel: 'billing_trial_ending',
  });
}
```

4. Update `module.exports` to add the two new functions:

```js
module.exports = {
  sendTemplateEmail,
  sendTemplateEmailAsync,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendGoogleAccountEmail,
  sendPaymentFailedEmail,
  sendTrialEndingEmail,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && ENV_FILE=../env/server/.env.development npx jest src/tests/unit/email.service.test.js src/tests/unit/email.template.test.js src/tests/unit/billing.lifecycle.test.js`
Expected: PASS. `billing.lifecycle.test.js` must still pass — it mocks the email service, so signatures must be unchanged.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/email.service.js server/src/tests/unit/email.service.test.js
git commit -m "refactor(email): render all templates through the shared renderer"
```

---

### Task 3: Contact form email through the renderer

**Files:**

- Modify: `server/src/modules/contact/contact.routes.js:60-85`
- Modify: `server/src/tests/integration/contact.test.js`

**Interfaces:**

- Consumes: `renderEmail` from Task 1.
- Produces: no new exports. The contact email keeps `subject`, `replyTo` and `fallbackLabel: 'contact_form'`.

- [ ] **Step 1: Write the failing test**

In `server/src/tests/integration/contact.test.js`, inside the escaping test, replace the final assertions with:

```js
// The html body must not contain the raw markup, and must carry the brand shell.
expect(call.html).not.toContain('<img src=x onerror');
expect(call.html).not.toContain('<script>');
expect(call.html).toContain('&lt;img src=x');
expect(call.html).toContain('The Sporty Way');
// Plain text stays raw — there is no markup to inject into.
expect(call.text).toContain('<script>alert("xss")</script>');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && ENV_FILE=../env/server/.env.development npx jest src/tests/integration/contact.test.js`
Expected: FAIL — `expect(call.html).toContain('The Sporty Way')` fails, because the body is still a bare `<pre>`.

- [ ] **Step 3: Write minimal implementation**

In `server/src/modules/contact/contact.routes.js`:

1. Add the require at the top:

```js
const { renderEmail } = require('../../services/email.template');
```

2. Replace the `htmlBodyLines` block and the `sendTemplateEmailAsync` call with:

```js
// OPT-024: renderEmail escapes every interpolated value on the HTML branch,
// so a submission like `<img onerror=...>` cannot execute in whatever renders
// this email. `bodyLines` stays raw — plaintext has no markup to inject into.
const { html, text } = renderEmail({
  preheader: `Contact form: ${name}`,
  greeting: 'New contact form submission',
  paragraphs: [
    `Name: ${name}`,
    `Email: ${email}`,
    `Role: ${roleLabel}`,
    `Club / Team: ${clubName}`,
    `Interest: ${interestLabel}`,
    ...(message ? [`Message:\n${message}`] : []),
  ],
  cta: null,
});

// OPT-020: dispatch off the request path — a slow/failing Resend call must
// not hold the contact form open; failures are logged server-side.
sendTemplateEmailAsync({
  to: env.CONTACT_EMAIL,
  replyTo: email,
  subject: `Contact form: ${name} (${clubName})`,
  text,
  html,
  fallbackLabel: 'contact_form',
});
```

3. Delete the now-unused `bodyLines` construction and the `escapeHtml` require — `renderEmail`
   escapes on its own HTML branch, so the route no longer escapes anything by hand. Verify with:

```bash
grep -n "escapeHtml\|bodyLines" server/src/modules/contact/contact.routes.js
```

Expected after cleanup: no matches.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && ENV_FILE=../env/server/.env.development npx jest src/tests/integration/contact.test.js`
Expected: PASS, all tests in the file.

Note: the existing assertion `text: expect.stringContaining('Email: local.test@example.com')` still holds — the renderer joins paragraphs with newlines, so that string survives.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/contact/contact.routes.js server/src/tests/integration/contact.test.js
git commit -m "refactor(contact): render the contact email through the shared renderer"
```

---

### Task 4: Welcome email and verification token on local registration

**Files:**

- Modify: `server/src/modules/auth/auth.service.js` (register, ~line 152–174)
- Modify: `server/src/tests/unit/auth.service.test.js`

**Interfaces:**

- Consumes: `sendWelcomeEmail` from Task 2; `generateRawToken`, `hashAuthToken`, `buildTokenExpiry` from `services/authToken.service`; `createAuthToken`, `invalidateTokensForUserByType` from `auth.repository`.
- Produces: `issueEmailVerification(user) -> Promise<string>` (module-private) returning the absolute verify URL.

- [ ] **Step 1: Write the failing test**

In `server/src/tests/unit/auth.service.test.js`:

1. Extend the `email.service` mock at the top of the file:

```js
jest.mock('../../services/email.service', () => ({
  sendPasswordResetEmail: jest.fn(),
  sendWelcomeEmail: jest.fn(),
  sendGoogleAccountEmail: jest.fn(),
  sendVerificationEmail: jest.fn(),
}));
```

2. Add after the existing require block:

```js
const emailService = require('../../services/email.service');
```

3. In the existing `register creates a local account and signs the user in` test, change the mocked
   `createUser` resolution `emailVerified: true` to `emailVerified: false`, and add these assertions
   at the end of that test:

```js
// New local accounts start unverified; the welcome email carries the link
// that flips the flag. Nothing gates on it, so this cannot lock anyone out.
expect(repository.createUser).toHaveBeenCalledWith(
  expect.objectContaining({ emailVerified: false })
);
expect(repository.createAuthToken).toHaveBeenCalledWith(
  expect.objectContaining({ type: 'email_verification' })
);
expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith(
  expect.objectContaining({
    to: 'player@example.com',
    needsVerification: true,
    ctaUrl: expect.stringContaining('/verify-email?token='),
  })
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && ENV_FILE=../env/server/.env.development npx jest src/tests/unit/auth.service.test.js -t "register creates a local account"`
Expected: FAIL — `sendWelcomeEmail` received 0 calls.

- [ ] **Step 3: Write minimal implementation**

In `server/src/modules/auth/auth.service.js`:

1. Extend the email-service require (currently line 42). Add **only** `sendWelcomeEmail` here —
   Tasks 6 and 7 add the other two as they start using them. Importing a symbol before its first
   use fails `pnpm lint` (`no-unused-vars`) on this commit:

```js
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../../services/email.service');
```

2. Add a helper directly below `buildClientUrl`:

```js
// Issues a fresh email_verification token and returns the link that consumes it.
// Prior unused tokens are invalidated first so an old link in an old inbox stops
// working the moment a new one is issued.
async function issueEmailVerification(user) {
  await invalidateTokensForUserByType(user._id, 'email_verification');

  const rawToken = generateRawToken();
  await createAuthToken({
    userId: user._id,
    type: 'email_verification',
    tokenHash: hashAuthToken(rawToken),
    expiresAt: buildTokenExpiry('email_verification'),
  });

  return buildClientUrl('/verify-email', rawToken);
}
```

3. In `register`, change `emailVerified: true` to `emailVerified: false` in the `createUser` call.

4. In `register`, immediately before the final `return issueAuthTokens(...)`, add:

```js
// The token is persisted before the send is dispatched, so a dropped email
// still leaves a valid link the user can obtain from /verify-email.
const verifyUrl = await issueEmailVerification(user);
sendWelcomeEmail({
  to: user.email,
  name: user.name,
  ctaUrl: verifyUrl,
  needsVerification: true,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && ENV_FILE=../env/server/.env.development npx jest src/tests/unit/auth.service.test.js`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/auth/auth.service.js server/src/tests/unit/auth.service.test.js
git commit -m "feat(auth): send a welcome email and issue a verification token on signup"
```

---

### Task 5: Welcome email for Google signups

**Files:**

- Modify: `server/src/modules/auth/auth.service.js` (`loginWithGoogle` ~line 341, `prepareGoogleExchange` ~line 359)
- Modify: `server/src/tests/unit/auth.service.test.js`

**Interfaces:**

- Consumes: `sendWelcomeEmail` from Task 2; `getPrimaryClientOrigin()` already in this module.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Add to `server/src/tests/unit/auth.service.test.js`:

```js
test('a first Google sign-in sends a welcome email with no verify link', async () => {
  repository.findOrCreateGoogleUser.mockResolvedValue({
    user: {
      _id: 'user-g1',
      email: 'google.user@example.com',
      name: 'Google User',
      roles: ['user'],
      emailVerified: true,
      authProvider: 'google',
    },
    isNew: true,
  });

  await authService.loginWithGoogle(
    { id: 'g-1', email: 'google.user@example.com', name: 'Google User' },
    { userAgent: 'jest', ip: '127.0.0.1' }
  );

  // Google has already confirmed the address, so the CTA goes straight to
  // onboarding rather than through a verification round-trip.
  expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith(
    expect.objectContaining({
      to: 'google.user@example.com',
      needsVerification: false,
      ctaUrl: expect.stringContaining('/onboarding'),
    })
  );
});

test('a returning Google user is not welcomed again', async () => {
  repository.findOrCreateGoogleUser.mockResolvedValue({
    user: {
      _id: 'user-g1',
      email: 'google.user@example.com',
      name: 'Google User',
      roles: ['user'],
      emailVerified: true,
      authProvider: 'google',
    },
    isNew: false,
  });

  await authService.loginWithGoogle(
    { id: 'g-1', email: 'google.user@example.com', name: 'Google User' },
    { userAgent: 'jest', ip: '127.0.0.1' }
  );

  expect(emailService.sendWelcomeEmail).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && ENV_FILE=../env/server/.env.development npx jest src/tests/unit/auth.service.test.js -t "Google"`
Expected: FAIL — `sendWelcomeEmail` received 0 calls on the first test.

- [ ] **Step 3: Write minimal implementation**

In `server/src/modules/auth/auth.service.js`, inside **both** `loginWithGoogle` and
`prepareGoogleExchange`, extend the existing `if (isNew) { ... }` block so it reads:

```js
if (isNew) {
  captureEventDetached({
    distinctId: String(user._id),
    event: 'user_registered',
    properties: { auth_provider: 'google' },
  });
  sendWelcomeEmail({
    to: user.email,
    name: user.name,
    ctaUrl: `${getPrimaryClientOrigin()}/onboarding`,
    needsVerification: false,
  });
}
```

Both sites must be updated — a user can arrive through either.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && ENV_FILE=../env/server/.env.development npx jest src/tests/unit/auth.service.test.js`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/auth/auth.service.js server/src/tests/unit/auth.service.test.js
git commit -m "feat(auth): welcome new Google users on first sign-in"
```

---

### Task 6: Implement requestEmailVerification

**Files:**

- Modify: `server/src/modules/auth/auth.service.js:263-269`
- Modify: `server/src/tests/unit/auth.service.test.js`

**Interfaces:**

- Consumes: `issueEmailVerification` from Task 4; `sendVerificationEmail` from Task 2; `findUserByEmail` from the repository.
- Produces: `requestEmailVerification(email) -> Promise<{ message: string }>`. The `verificationUrl` key is removed from the response.

- [ ] **Step 1: Write the failing test**

Add to `server/src/tests/unit/auth.service.test.js`:

```js
test('requestEmailVerification sends for an unverified user', async () => {
  repository.findUserByEmail.mockResolvedValue({
    _id: 'user-2',
    email: 'unverified@example.com',
    name: 'Unverified',
    emailVerified: false,
  });

  const result = await authService.requestEmailVerification('unverified@example.com');

  expect(repository.createAuthToken).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'email_verification' })
  );
  expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
    expect.objectContaining({
      to: 'unverified@example.com',
      verifyUrl: expect.stringContaining('/verify-email?token='),
    })
  );
  expect(result.message).toMatch(/verification link has been sent/i);
});

test('requestEmailVerification does not resend for an already-verified user', async () => {
  repository.findUserByEmail.mockResolvedValue({
    _id: 'user-3',
    email: 'verified@example.com',
    name: 'Verified',
    emailVerified: true,
  });

  await authService.requestEmailVerification('verified@example.com');

  expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
});

test('requestEmailVerification reveals nothing for an unknown address', async () => {
  repository.findUserByEmail.mockResolvedValue(null);

  const known = await authService.requestEmailVerification('unknown@example.com');
  jest.clearAllMocks();
  repository.findUserByEmail.mockResolvedValue({
    _id: 'user-4',
    email: 'real@example.com',
    emailVerified: true,
  });
  const unknown = await authService.requestEmailVerification('real@example.com');

  // Identical response regardless of whether the account exists.
  expect(known).toEqual(unknown);
  expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && ENV_FILE=../env/server/.env.development npx jest src/tests/unit/auth.service.test.js -t "requestEmailVerification"`
Expected: FAIL — `sendVerificationEmail` received 0 calls.

- [ ] **Step 3: Write minimal implementation**

First add `sendVerificationEmail` to the email-service require at the top of
`server/src/modules/auth/auth.service.js`:

```js
const {
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendVerificationEmail,
} = require('../../services/email.service');
```

Then replace `requestEmailVerification`:

```js
async function requestEmailVerification(email) {
  const user = await findUserByEmail(email);

  if (user && !user.emailVerified) {
    const verifyUrl = await issueEmailVerification(user);
    sendVerificationEmail({ to: user.email, name: user.name, verifyUrl });
  }

  // The same response whether or not the account exists, so this endpoint is
  // not an account-existence oracle.
  return {
    message: 'If an account exists for that email, a verification link has been sent.',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && ENV_FILE=../env/server/.env.development npx jest src/tests/unit/auth.service.test.js`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/auth/auth.service.js server/src/tests/unit/auth.service.test.js
git commit -m "feat(auth): implement the verification resend endpoint"
```

---

### Task 7: Google branch on forgot-password

**Files:**

- Modify: `server/src/modules/auth/auth.service.js:289-299`
- Modify: `server/src/tests/unit/auth.service.test.js`

**Interfaces:**

- Consumes: `sendGoogleAccountEmail` from Task 2.
- Produces: nothing new. `forgotPassword(email) -> Promise<{ message: string }>` unchanged.

- [ ] **Step 1: Write the failing test**

Add to `server/src/tests/unit/auth.service.test.js`:

```js
test('forgot-password on a Google account sends the Google notice, not a reset', async () => {
  repository.findUserByEmail.mockResolvedValue({
    _id: 'user-g2',
    email: 'google.user@example.com',
    name: 'Google User',
    authProvider: 'google',
    passwordHash: undefined,
  });

  await authService.forgotPassword('google.user@example.com');

  expect(emailService.sendGoogleAccountEmail).toHaveBeenCalledWith(
    expect.objectContaining({
      to: 'google.user@example.com',
      loginUrl: expect.stringContaining('/login'),
    })
  );
  expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
});

test('forgot-password returns an identical response for every branch', async () => {
  repository.findUserByEmail.mockResolvedValue({
    _id: 'u1',
    email: 'local@example.com',
    passwordHash: 'hash',
  });
  const local = await authService.forgotPassword('local@example.com');

  repository.findUserByEmail.mockResolvedValue({
    _id: 'u2',
    email: 'google@example.com',
    authProvider: 'google',
  });
  const google = await authService.forgotPassword('google@example.com');

  repository.findUserByEmail.mockResolvedValue(null);
  const missing = await authService.forgotPassword('nobody@example.com');

  // Identical bodies, so forgot-password cannot be used to discover which
  // addresses have accounts or how they sign in.
  expect(local).toEqual(google);
  expect(google).toEqual(missing);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && ENV_FILE=../env/server/.env.development npx jest src/tests/unit/auth.service.test.js -t "Google account sends"`
Expected: FAIL — `sendGoogleAccountEmail` received 0 calls.

- [ ] **Step 3: Write minimal implementation**

First add `sendGoogleAccountEmail` to the email-service require at the top of
`server/src/modules/auth/auth.service.js`:

```js
const {
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendVerificationEmail,
  sendGoogleAccountEmail,
} = require('../../services/email.service');
```

Then replace `forgotPassword`:

```js
async function forgotPassword(email) {
  const user = await findUserByEmail(email);

  if (user && user.passwordHash) {
    await issuePasswordReset(user);
  } else if (user) {
    // A Google account has no password to reset. Without this the request is a
    // silent dead end; the response is unchanged, so only the true mailbox
    // owner learns anything.
    sendGoogleAccountEmail({
      to: user.email,
      name: user.name,
      loginUrl: `${getPrimaryClientOrigin()}/login`,
    });
  }

  return {
    message: 'If an account exists for that email, a reset link has been sent.',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && ENV_FILE=../env/server/.env.development npx jest src/tests/unit/auth.service.test.js`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/auth/auth.service.js server/src/tests/unit/auth.service.test.js
git commit -m "feat(auth): reply to forgot-password on Google accounts"
```

---

### Task 8: Auto-verify from the email link and land on onboarding

**Files:**

- Modify: `client/src/features/auth/pages/VerifyEmailPage.jsx`
- Create: `client/src/features/auth/pages/VerifyEmailPage.test.jsx`

**Interfaces:**

- Consumes: `authApi.verifyEmail({ token })` (already exists, `authApi.js:26`).
- Produces: nothing new.

The page currently renders a form the user must submit even when the token is in the URL. A
single-CTA email needs it to verify on arrival and continue to `/onboarding`.

- [ ] **Step 1: Write the failing test**

Create `client/src/features/auth/pages/VerifyEmailPage.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { VerifyEmailPage } from './VerifyEmailPage';

vi.mock('../api/authApi', () => ({
  authApi: { verifyEmail: vi.fn(), requestVerification: vi.fn() },
}));

const { authApi } = await import('../api/authApi');

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/onboarding" element={<p>Onboarding</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.resetAllMocks());

describe('VerifyEmailPage', () => {
  test('verifies automatically when the url carries a token', async () => {
    authApi.verifyEmail.mockResolvedValue({ message: 'Email verified.' });

    renderAt('/verify-email?token=abc123');

    await waitFor(() => expect(authApi.verifyEmail).toHaveBeenCalledWith({ token: 'abc123' }));
  });

  test('lands the user on onboarding after verifying', async () => {
    authApi.verifyEmail.mockResolvedValue({ message: 'Email verified.' });

    renderAt('/verify-email?token=abc123');

    expect(await screen.findByText('Onboarding')).toBeInTheDocument();
  });

  test('verifies once despite StrictMode double-invocation', async () => {
    authApi.verifyEmail.mockResolvedValue({ message: 'Email verified.' });

    renderAt('/verify-email?token=abc123');

    await waitFor(() => expect(authApi.verifyEmail).toHaveBeenCalled());
    expect(authApi.verifyEmail).toHaveBeenCalledTimes(1);
  });

  test('does not auto-verify when there is no token', () => {
    renderAt('/verify-email');

    expect(authApi.verifyEmail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/features/auth/pages/VerifyEmailPage.test.jsx`
Expected: FAIL — `verifyEmail` received 0 calls; the page waits for a form submit.

- [ ] **Step 3: Write minimal implementation**

In `client/src/features/auth/pages/VerifyEmailPage.jsx`:

1. Update the imports:

```jsx
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
```

2. Inside the component, after the existing `useState` declarations, add:

```jsx
const navigate = useNavigate();
// React StrictMode double-invokes effects in development. A verification
// token is single-use, so a second call would fail against a token the first
// call already consumed — the ref makes the attempt genuinely one-shot.
const attempted = useRef(false);

useEffect(() => {
  if (!token || attempted.current) return;
  attempted.current = true;

  let cancelled = false;
  setIsSubmitting(true);

  authApi
    .verifyEmail({ token })
    .then(() => {
      if (cancelled) return;
      // One CTA in the email does both jobs: confirm the address, then drop
      // the user straight into setting up their first team or league.
      navigate('/onboarding', { replace: true });
    })
    .catch((submitError) => {
      if (cancelled) return;
      setError(submitError.message || 'Unable to verify email.');
    })
    .finally(() => {
      if (!cancelled) setIsSubmitting(false);
    });

  return () => {
    cancelled = true;
  };
}, [token, navigate]);
```

3. Leave `onVerifyToken` and `onRequestNew` in place — they remain the manual fallback when the
   automatic attempt fails.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/features/auth/pages/VerifyEmailPage.test.jsx`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add client/src/features/auth/pages/VerifyEmailPage.jsx client/src/features/auth/pages/VerifyEmailPage.test.jsx
git commit -m "feat(auth): verify from the email link and continue to onboarding"
```

---

### Task 9: Full suite, lint, and documentation

**Files:**

- Modify: `docs/email-delivery.md`

- [ ] **Step 1: Run the full verification sweep**

```bash
pnpm check-env && pnpm lint && pnpm test && pnpm build
```

Expected: all pass. Fix anything that fails before continuing — do not update the docs against a red suite.

- [ ] **Step 2: Update the email catalogue in the docs**

In `docs/email-delivery.md`, replace the opening paragraph beginning "**Four** emails actually go
out" with:

```markdown
**Seven** emails go out: welcome, email verification, password reset, "you sign in with Google",
contact form, payment failed and trial ending. Sending is `hello@thesportyway.com`. The contact form
is delivered to `CONTACT_EMAIL` with `replyTo` set to whoever submitted it; every other email
defaults `replyTo` to `CONTACT_EMAIL`, so the sending address needs no mailbox of its own and never
needs to say "no-reply".

All seven render through `server/src/services/email.template.js`. Add new emails there rather than
hand-writing markup — it is what keeps the HTML and plain-text bodies in step and guarantees the
no-images rule that four of Resend's deliverability checks depend on.
```

- [ ] **Step 3: Delete the stale section**

Remove the entire `## Email verification does not send` section — it is now false. Remove the
Outstanding item **"Decide what to do about email verification"** for the same reason.

- [ ] **Step 4: Record what shipped**

Add to the `## Done` section:

```markdown
- [x] Gave every email a shared branded template (`email.template.js`): one renderer producing HTML
      and plain text together so they cannot drift, table layout, inline CSS, no images.
- [x] Added a welcome email on signup for both local and Google registration, with a single CTA that
      verifies the address and lands the user on `/onboarding`.
- [x] Implemented `requestEmailVerification`, which was a stub returning "a verification link has
      been sent" while sending nothing.
- [x] Answered forgot-password on Google accounts, which was previously a silent dead end.
```

- [ ] **Step 5: Manual verification on dev**

After deploying the branch to dev, confirm with a mailbox you control. Gmail `+` addressing gives a
password account whose mail you can read: register `y.simon.cordova+tsw1@gmail.com`.

- [ ] Register that address — welcome email arrives, its button verifies and lands on `/onboarding`
- [ ] Forgot-password on that address — reset email arrives and the link sets a new password
- [ ] Forgot-password on your Google address — the "you sign in with Google" email arrives
- [ ] Submit the contact form — it reaches `contact@thesportyway.com`
- [ ] In Gmail, open any of them → ⋮ → **Show original** and confirm `SPF: PASS`, `DKIM: PASS` with
      domain `thesportyway.com`, `DMARC: PASS`

- [ ] **Step 6: Commit**

```bash
git add docs/email-delivery.md
git commit -m "docs: record the email template and flow work"
```
