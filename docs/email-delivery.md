# Email Delivery: Manual Actions

TSW sends email through the **Resend API**, not SMTP. There is no SMTP client in the codebase.

**Seven** emails go out: welcome, email verification, password reset, "you sign in with Google",
contact form, payment failed and trial ending. Sending is `hello@thesportyway.com`. The contact form
is delivered to `CONTACT_EMAIL` with `replyTo` set to whoever submitted it; every other email
defaults `replyTo` to `CONTACT_EMAIL`, so the sending address needs no mailbox of its own and never
needs to say "no-reply".

All seven render through `server/src/services/email.template.js`. Add new emails there rather than
hand-writing markup — it is what keeps the HTML and plain-text bodies in step and guarantees the
no-images rule that four of Resend's deliverability checks depend on.

## Outstanding

### Once mail is flowing

- [ ] **Revoke the Gmail app password** that was in `SMTP_PASS`. The variable is gone from the env
      files, but the credential is still live in the Google account until revoked.
- [ ] **If you ever move the Resend region**, the `send.` MX value changes with it
      (`feedback-smtp.<region>.amazonses.com`) and mail stops the moment the old record no longer
      matches. Update DNS and `/privacy` in the same sitting.
- [ ] **Test password reset end to end on dev** with a real mailbox, and reply to one of the
      messages to confirm the reply reaches `contact@thesportyway.com`.
- [ ] **Tighten DMARC over time.** It is published at `p=none`, which monitors without affecting
      delivery. Move in stages, a week or two apart, reading the reports each time:
      `p=none` → `p=quarantine; pct=25` → `p=quarantine` → `p=reject`. Do not jump to `p=reject`; if
      anything is misaligned you will silently lose real mail.

  Leave alignment alone. The relaxed defaults are what TSW needs: Resend's return-path is on
  `send.thesportyway.com` while the From header is `hello@thesportyway.com`, and relaxed alignment
  treats those as the same organisational domain. Adding `aspf=s` would fail every message.

  Reports arrive as zipped XML from every receiving provider and are unreadable by eye. Consider
  pointing `rua` at a dedicated address rather than the mailbox a human reads, or feed it to a free
  DMARC report viewer.

- [ ] **Sending subdomain — optional, deferred.** Resend lists this under "possible improvements".
      The benefit is segmenting reputation so a marketing blast cannot damage password-reset
      delivery. TSW only sends transactional mail, so there is nothing to segment yet, and the cost
      is a second domain to verify plus another set of DNS records. Worth doing the day a newsletter
      appears; not before.

## Done

- [x] Verified `thesportyway.com` in Resend, in the **eu-west-1 (Ireland)** region. DKIM
      (`resend._domainkey`), SPF (`send.thesportyway.com`) and MX (`send.thesportyway.com` →
      `feedback-smtp.eu-west-1.amazonses.com`, priority 10) are all live in DNS.
- [x] **Fixed the delivery outage (5 Sep 2026).** Nothing sent through Resend was reaching the
      mailbox. `send.thesportyway.com` — the envelope sender (return-path) Resend/SES stamps on
      every message — had no MX, A or AAAA record, so it did not exist as far as a receiving mail
      server was concerned. Namecheap Private Email runs Postfix with `reject_unknown_sender_domain`
      and refused every message during the handshake, before the body was transmitted:

      ```
      before:  MAIL FROM <bounce@send.thesportyway.com> / RCPT TO <contact@> -> 554 5.1.8 Sender address rejected: Domain not found
      after:   MAIL FROM <bounce@send.thesportyway.com> / RCPT TO <contact@> -> 250 2.1.5 Ok
      ```

      Adding the MX record on `send` cleared it. The mailbox and Resend were both healthy
      throughout — Resend accepted each send, and the recipient rejected it.

- [x] Corrected the Resend entry on `/privacy`. It said `United States` outright, which the
      eu-west-1 region contradicts. Now reads `European Union (Ireland)`, with the detail line
      noting that email is processed in the EU while Resend itself is a US-based company.
- [x] Published a DMARC record at `_dmarc`, currently `p=none`.
- [x] Published SPF at the **root** domain (`v=spf1 include:spf.privateemail.com ~all`), so mail the
      Namecheap mailbox sends itself — every reply written from `contact@thesportyway.com` — has a
      policy to pass. It resolves to 4 of SPF's 10 permitted DNS lookups, and every leaf is an
      `ip4:` literal, so there is headroom. Keep it to one root SPF record: two on the same name is
      a permanent error, not a merge.
- [x] Settled the sending address on `hello@thesportyway.com` in both env files and both Render
      services. `render.yaml` needs no edit — all three email keys are `sync: false` on both
      services, so the dashboard is authoritative by design.
- [x] Removed the dead `SMTP_*` block from both env files.
- [x] Gave every email a shared branded template (`email.template.js`): one renderer producing HTML
      and plain text together so they cannot drift, table layout, inline CSS, no images.
- [x] Added a welcome email on signup for both local and Google registration, with a single CTA that
      verifies the address and lands the user on `/onboarding`.
- [x] Implemented `requestEmailVerification`, which was a stub returning "a verification link has
      been sent" while sending nothing.
- [x] Answered forgot-password on Google accounts, which was previously a silent dead end.

## Current DNS state

Verified against the authoritative nameserver on 5 September 2026. All six records must stay in
place; the outage below was caused by exactly one of them being absent.

| Name                      | Type | Value                                       |
| ------------------------- | ---- | ------------------------------------------- |
| `thesportyway.com`        | MX   | `mx1` / `mx2.privateemail.com`, priority 10 |
| `thesportyway.com`        | TXT  | `v=spf1 include:spf.privateemail.com ~all`  |
| `send.thesportyway.com`   | MX   | `feedback-smtp.eu-west-1.amazonses.com`, 10 |
| `send.thesportyway.com`   | TXT  | `v=spf1 include:amazonses.com ~all`         |
| `resend._domainkey…`      | TXT  | DKIM public key                             |
| `_dmarc.thesportyway.com` | TXT  | `v=DMARC1; p=none;`                         |

## Verified working (5 September 2026)

Each template was fired through the real `email.service` code against the dev environment and
accepted by Resend; the four live call sites were read and confirmed wired.

| Email          | Trigger                                       | Call site                                         | Send |
| -------------- | --------------------------------------------- | ------------------------------------------------- | ---- |
| Contact form   | `POST /contact`                               | `contact.routes.js:74`                            | ✅   |
| Password reset | `POST /auth/forgot-password`                  | `auth.service.js:130` (`issuePasswordReset`)      | ✅   |
| Payment failed | Stripe `invoice.payment_failed`               | `billing.service.js:849` (team), `:1071` (league) | ✅   |
| Trial ending   | Stripe `customer.subscription.trial_will_end` | `billing.service.js:862` (team), `:1084` (league) | ✅   |

`CLIENT_ORIGIN` on the deployed dev API resolves to `https://dev.thesportyway.com`, confirmed from
its CORS response, so password-reset links built by `buildClientUrl` point at the right host.

Billing emails pass no `name`, so both open with "Hi there" — intended, since a billing contact is
an address on a Team or League, not necessarily a user record.

## Already passing — do not break these

Resend's deliverability advisor reports these as satisfied. Each is a property of the code, not
luck, so they are easy to regress without noticing:

| Resend check                    | Why it passes                                                            |
| ------------------------------- | ------------------------------------------------------------------------ |
| Plain text version included     | Every send passes `text` alongside `html`.                               |
| Email body size small           | ~0.16KB of HTML, far below Gmail's 102KB clipping threshold.             |
| Link URLs match sending domain  | Verify and reset links point at `thesportyway.com`, the sending domain.  |
| Images hosted on sending domain | The emails contain no images at all.                                     |
| No SVG images                   | Same — no images.                                                        |
| Full YouTube URLs               | No YouTube links.                                                        |
| No shared click-tracking domain | No tracking options are set on the send call, so nothing rewrites links. |
| No shared open-tracking domain  | Same — no tracking pixel is injected.                                    |

If you ever enable Resend's open or click tracking, the last two flip to failing until you configure
a **custom tracking subdomain**. Shared tracking domains get flagged by spam filters. Given the mail
is transactional, tracking opens on a password reset is not worth that cost.

Keep new emails plain: text version always, no images, no link shorteners, links on
`thesportyway.com`.

## Two things that will catch you out

**Failures are silent.** Sends are fire-and-forget (`sendTemplateEmailAsync`, OPT-020). A failure is
caught and logged server-side; the user's request already returned 200. A broken configuration looks
exactly like a working app until someone reports a missing password-reset email. So check **both**
the Resend → Emails log and the Render logs for `Async email delivery failed`.

**Root vs subdomain DNS.** The Namecheap mailbox needs MX and SPF at the **root** domain; Resend's
records sit on **`send.thesportyway.com`**. Both sets must exist at once. This is not cosmetic — a
missing record on the `send.` subdomain took down all delivery to the mailbox (see Outstanding #1),
because receiving servers reject an envelope sender whose domain has no DNS. Never let a setup
wizard overwrite the root MX or SPF, and never have two SPF records on the same name.

## One dependency worth knowing

`/privacy#data-deletion` publishes a commitment to acknowledge deletion requests within 7 days,
routed through the contact form. That form is delivered by Resend. If sending is broken, those
requests never arrive — and a Meta App Review reviewer may well send a test one. See
[`instagram-integration/manual-actions.md`](./instagram-integration/manual-actions.md).
