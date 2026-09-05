# Email Delivery: Manual Actions

TSW sends email through the **Resend API**, not SMTP. There is no SMTP client in the codebase.

Five emails go out: contact form, email verification, password reset, payment failed, trial ending.
Sending is `hello@thesportyway.com`. The contact form is delivered to `CONTACT_EMAIL` with `replyTo`
set to whoever submitted it; every other email defaults `replyTo` to `CONTACT_EMAIL`, so the sending
address needs no mailbox of its own and never needs to say "no-reply".

## Outstanding

- [ ] **Revoke the Gmail app password** that was in `SMTP_PASS`. The variable is gone from the env
      files, but the credential itself is still live in the Google account until revoked.
- [ ] **Pick the Resend region.** EU (Ireland) matches the rest of the stack. If you choose it,
      `/privacy` needs updating: the processor table currently says Resend is in the United States.
- [ ] **Test on dev after deploying**: password reset, email verification, contact form. Reply to one
      of them and confirm it reaches `contact@thesportyway.com`.
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

- [x] Verified `thesportyway.com` in Resend, with its DKIM, SPF and MX records in DNS.
- [x] Published a DMARC record at `_dmarc`, currently `p=none`.
- [x] Settled the sending address on `hello@thesportyway.com` in both env files and both Render
      services. `render.yaml` needs no edit — all three email keys are `sync: false` on both
      services, so the dashboard is authoritative by design.
- [x] Removed the dead `SMTP_*` block from both env files.

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

**Root vs subdomain DNS.** The Namecheap mailbox needs MX and SPF at the root domain. Resend's
records sit on `send.thesportyway.com`. They coexist — but do not let a setup wizard overwrite your
root SPF, and never have two SPF records on the same name.

## One dependency worth knowing

`/privacy#data-deletion` publishes a commitment to acknowledge deletion requests within 7 days,
routed through the contact form. That form is delivered by Resend. If sending is broken, those
requests never arrive — and a Meta App Review reviewer may well send a test one. See
[`instagram-integration/manual-actions.md`](./instagram-integration/manual-actions.md).
