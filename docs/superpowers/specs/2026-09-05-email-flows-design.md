# Email flows: shared templates, welcome email, completed verification

**Date:** 5 September 2026
**Branch:** `feat/email-fixes`
**Status:** approved design, not yet implemented

## Context

Delivery itself was fixed on 5 September 2026 — `send.thesportyway.com` had no MX record, so
Namecheap's Postfix rejected every message from Resend during the SMTP handshake. See
[`docs/email-delivery.md`](../../email-delivery.md). Mail now arrives.

With delivery working, three problems in the application remain:

1. **Templates are bare.** Each send hand-writes its own HTML as a one-line string of `<p>` tags
   (`email.service.js:89,101,117,136`) and separately hand-writes the plain-text version. The two
   can drift, there is no layout, no call-to-action button, and no footer.
2. **Email verification is half-wired.** `sendVerificationEmail` is defined and exported but called
   from nowhere. `requestEmailVerification` (`auth.service.js:263`) is a stub — `void email;` — that
   returns "a verification link has been sent" while sending nothing. Both
   `/auth/request-verification` and `/auth/verify-email` are live routes the client calls, and
   `LoginForm.jsx:118` advertises "Need a new verification email?". The UI promises an email that
   cannot arrive.
3. **Two silent dead ends.** A Google sign-in user who clicks "Forgot password" gets nothing, because
   `forgotPassword` only acts `if (user && user.passwordHash)` (`auth.service.js:292`). And no email
   is sent when a user signs up at all.

## Goals

- One shared renderer producing both HTML and plain text, so they cannot drift.
- A welcome email on signup, for both local and Google registration.
- Verification that actually sends, without gating anything.
- A resolved answer for Google users who land on forgot-password.
- Every one of Resend's eight deliverability checks still passing.

## Non-goals

- Enforcing `emailVerified` anywhere. Nothing gates on it today and nothing will after this work.
- Marketing email, newsletters, or a sending subdomain.
- Open/click tracking. Enabling it would fail two Resend checks until a custom tracking subdomain
  exists, and tracking opens on a password reset is not worth that.
- Backfilling `emailVerified` for existing users. See Risks.

## Design

### 1. Shared template layer

New file: `server/src/services/email.template.js`.

```js
renderEmail({ preheader, greeting, paragraphs, cta, footnote }) -> { html, text }
```

| Field        | Type                     | Notes                                                      |
| ------------ | ------------------------ | ---------------------------------------------------------- |
| `preheader`  | `string`                 | Inbox preview text; visually hidden in the HTML body.      |
| `greeting`   | `string`                 | Defaults to `Hi there,` when no name is known.             |
| `paragraphs` | `string[]`               | Body copy, one `<p>` each.                                 |
| `cta`        | `{ label, url } \| null` | Renders a button; omitted entirely when null.              |
| `footnote`   | `string \| null`         | Small print under the button — expiry, "ignore this", etc. |

Constraints, all load-bearing:

- **Table-based layout, inline CSS.** Email clients strip `<style>` blocks and have no flexbox or
  grid. Nested tables with inline `style` attributes are the only reliable approach.
- **No images of any kind.** Keeps four Resend checks green (images on sending domain, no SVG,
  and both tracking-domain checks), and the design renders identically with images blocked, which is
  the default in Outlook and many Gmail configurations. The wordmark is text.
- **HTML and text from one call.** The text branch renders the CTA as `label: url` on its own line,
  so the link is always reachable without HTML.
- **Escaping happens in the renderer**, on the HTML branch only. Plain text has no markup to inject
  into. Callers pass raw values and never escape by hand.
- **URLs are not escaped as body text.** They are placed in `href` and passed through `encodeURI`,
  matching the existing treatment of `manageUrl` at `email.service.js:120`.

Consolidate the duplicate escape helper while here: `email.service.js:12` defines its own
`escapeHtml`, identical in behaviour to `server/src/utils/escapeHtml.js` (used by
`contact.routes.js`). The renderer imports the shared util and the local copy is deleted.

Palette: emerald button on white, slate text, matching the app.

### 2. Email catalogue

All seven route through `renderEmail`.

| Email               | Trigger                                       | Call site                                    | State                    |
| ------------------- | --------------------------------------------- | -------------------------------------------- | ------------------------ |
| Welcome             | signup, local and Google                      | `auth.service.js` register + Google `isNew`  | **new**                  |
| Password reset      | `POST /auth/forgot-password`, local account   | `auth.service.js:130`                        | exists, re-rendered      |
| Sign in with Google | `POST /auth/forgot-password`, Google account  | `auth.service.js` `forgotPassword`           | **new**                  |
| Verify email        | `POST /auth/request-verification`             | `auth.service.js` `requestEmailVerification` | template exists, unwired |
| Contact form        | `POST /contact`                               | `contact.routes.js:74`                       | exists, re-rendered      |
| Payment failed      | Stripe `invoice.payment_failed`               | `billing.service.js:849`, `:1071`            | exists, re-rendered      |
| Trial ending        | Stripe `customer.subscription.trial_will_end` | `billing.service.js:862`, `:1084`            | exists, re-rendered      |

The contact-form email is internal — it goes to `CONTACT_EMAIL`, not to a customer. It gets the
shared shell for consistency but keeps its `<pre>` submission block, which is the readable format
for scanning a form submission.

### 3. Verification, completed

The token infrastructure already exists and is tested: `generateRawToken`, `hashAuthToken` and
`buildTokenExpiry('email_verification')` all live in `services/authToken.service.js`
(`tests/unit/authToken.service.test.js:25`). Only the issue-and-send step is missing.

**Registration (local).** `register` currently sets `emailVerified: true` outright
(`auth.service.js:158`). Change to `false`, then issue an `email_verification` token and send the
welcome email carrying the verify link. The user is still signed straight in — `register` returns
`issueAuthTokens(...)` (`auth.service.js:173`) — so verification never blocks first use.

**Registration (Google).** `findOrCreateGoogleUser` already sets `emailVerified: true`
(`auth.repository.js:132`) and returns `{ user, isNew }`. Both `loginWithGoogle` and
`prepareGoogleExchange` already branch on `isNew` to fire a `user_registered` analytics event
(`auth.service.js:348`, `:366`). The welcome email hooks in beside that event, at both sites. Google
has already confirmed the address, so this variant carries no verify link — its CTA goes straight to
`/onboarding`.

**Resend.** `requestEmailVerification` gets a real body: look up the user; if one exists and is not
already verified, invalidate prior `email_verification` tokens, issue a fresh one, and send. Return
the same message unconditionally, preserving enumeration resistance. Drop `verificationUrl` from the
response — it is always `null` and the client already tolerates its absence
(`VerifyEmailPage.jsx:50`).

**Single CTA.** The welcome email has one button. It points at
`/verify-email?token=…`, which verifies and then lands the user on `/onboarding`. Two buttons would
split the most valuable click of the entire lifecycle; one button does both jobs.

### 4. Google forgot-password

`forgotPassword` gains one branch:

```
user exists, has passwordHash        -> issuePasswordReset (unchanged)
user exists, no passwordHash         -> sendGoogleAccountEmail
no user                              -> nothing (unchanged)
```

The HTTP response is byte-identical in all three cases, so forgot-password does not become an
account-existence oracle. Only the true owner of the mailbox learns anything — which is the entire
point.

### 5. Client changes

- `VerifyEmailPage` redirects to `/onboarding` on successful verification instead of showing a
  terminal success message. `/onboarding` is behind `ProtectedRoute` (`AppRouter.jsx:367`); a user
  clicking from the browser they signed up in is already authenticated, and one arriving on another
  device is routed through login first, which is correct.
- `LoginForm.jsx:118`'s "Need a new verification email?" link stays — it now leads somewhere real.

## Data flow

```
register (local)
  └─ create user (emailVerified: false)
     ├─ issueAuthTokens          -> user is signed in immediately
     ├─ issue email_verification token
     └─ sendWelcomeEmail({ verifyUrl })        [fire-and-forget]

loginWithGoogle / prepareGoogleExchange, isNew
  └─ user created (emailVerified: true)
     └─ sendWelcomeEmail({ onboardingUrl })    [fire-and-forget]

forgot-password
  ├─ local account  -> sendPasswordResetEmail  [fire-and-forget]
  ├─ Google account -> sendGoogleAccountEmail  [fire-and-forget]
  └─ no account     -> nothing
  (identical 200 response in all three cases)

GET /verify-email?token=…
  └─ POST /auth/verify-email -> markEmailVerified -> redirect /onboarding
```

## Error handling

Every send stays fire-and-forget via `sendTemplateEmailAsync` (OPT-020). A failing or slow Resend
call must never fail a registration or a webhook. Two consequences to keep in mind:

- A failed welcome email is invisible to the user and logged as `Async email delivery failed`. The
  account still exists and still works — correct, since email is not on the critical path.
- Token issuance is awaited and persisted **before** the send is dispatched, matching
  `issuePasswordReset` (`auth.service.js:117-131`). A dropped email therefore leaves a valid token
  the user can still obtain via the resend route.

## Testing

| Area                       | Test                                                                  |
| -------------------------- | --------------------------------------------------------------------- |
| `renderEmail`              | HTML and text carry the same CTA URL; no `<img>` in output            |
| `renderEmail`              | User-supplied values escaped in HTML, raw in text                     |
| `renderEmail`              | `cta: null` omits the button without leaving empty markup             |
| `register`                 | Creates user with `emailVerified: false`, issues token, sends welcome |
| Google `isNew`             | Sends welcome with no verify link; repeat login sends nothing         |
| `forgotPassword`           | Local -> reset email; Google -> Google email; unknown -> no send      |
| `forgotPassword`           | Response body identical across all three                              |
| `requestEmailVerification` | Issues token and sends for an unverified user; no-ops for verified    |
| `contact.test.js`          | Updated for the new body shape                                        |

Server tests are Jest + Supertest, run with `pnpm --filter server test`. Existing patterns to follow:
`tests/unit/auth.service.test.js` (mocks `email.service`), `tests/unit/billing.lifecycle.test.js`.

## Risks

**`emailVerified` gains a meaningful `false` for the first time.** Every local user who signed up
before this change is `true`; after it, only those who click. Nothing reads the flag today, so this
is inert — but the day something gates on it, that cohort split becomes a migration problem. Record
the decision then; do not pre-emptively backfill now.

**Deliverability checks are easy to regress.** The no-images rule is not cosmetic. Adding a logo
image would fail Resend's image checks; enabling tracking would fail the two tracking-domain checks
until a custom tracking subdomain exists. The renderer is the single place this can go wrong, which
is an argument for it existing.

**Enumeration resistance depends on the response, not the branch.** The three-way branch in
`forgotPassword` must not change status code, body, or timing characteristics. A test asserts the
response is identical.
