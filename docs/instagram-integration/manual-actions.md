# Instagram Connection: Manual Actions

These are the actions that cannot be completed in source code because they require the TSW Meta
account, Instagram account, deployment secrets, and a real application user. Complete development
first, and leave Instagram publishing disabled in production until App Review grants it — but note
that the privacy, terms and data-deletion pages **do** have to ship to production before submitting,
because that is where Meta's settings point.

**What is still outstanding is listed at the bottom of this file.** The numbered steps below are the
full record, including what is already done.

Never put a username, password, app secret, access token, or encryption key in this file, in
`render.yaml`, or in a chat message.

## 1. Prepare the Instagram account

- [x] Use a dedicated non-production Instagram **Business or Creator** account for the first test.
- [x] Confirm the person performing setup can sign in to that Instagram account.

## 2. Configure Meta

- [x] Create or select the TSW Meta developer Business app.
- [x] Add **Instagram API with Instagram Login**.
- [x] In Business Login settings, add the exact deployed development callback URL:
      `https://dev-api.thesportyway.com/api/v1/social/instagram/oauth/callback`.
- [x] Add the test professional account to the app's test roles and accept any invitation from the
      Instagram account.
- [x] Keep the initial permissions to `instagram_business_basic` and
      `instagram_business_content_publish`.
- [x] Record the Instagram App ID. Put the App Secret only in the local environment/deployment
      secret store.

Meta requires redirect URL equality. Scheme, hostname, port, path, and trailing slash must match
the server value exactly. Meta rejected the previous plain-HTTP localhost callback, so hosted
development uses the public HTTPS API callback above. The webhook callback fields in Meta's setup
screen are intentionally left blank because this integration does not consume Instagram webhooks.

## 3. Configure the development server

Choose a Graph API version currently supported by the Meta app; do not use `latest`. Generate the
encryption key locally with `openssl rand -hex 32`, then store it securely. Losing or changing this
key without a rotation makes the saved access token unreadable.

Set the following in `env/server/.env.development` or the development deployment's secret store:

```dotenv
INSTAGRAM_OAUTH_ENABLED=true
INSTAGRAM_GRAPH_API_VERSION=v26.0
INSTAGRAM_APP_ID=replace-with-instagram-app-id
INSTAGRAM_APP_SECRET=replace-in-secret-store
INSTAGRAM_OAUTH_REDIRECT_URL=https://dev-api.thesportyway.com/api/v1/social/instagram/oauth/callback
INSTAGRAM_TOKEN_ENCRYPTION_KEY=replace-with-64-hex-characters
INSTAGRAM_TOKEN_KEY_VERSION=v1
INSTAGRAM_PUBLISHING_ENABLED=false
```

Keep `INSTAGRAM_PUBLISHING_ENABLED=false` through connection, draft creation, and approval. Enable
it only for the controlled delivery test in step 6. Secret values belong in the Render environment
and must not be added to `render.yaml` or committed environment files.

## 4. Grant your TSW user operator access

Create the database indexes once per environment. This is required because production deliberately
disables automatic Mongoose index creation:

```bash
pnpm --filter server instagram:ensure-indexes
```

Run this command again after deploying the social-post/delivery code, even if it was run for the
earlier connection milestone; the newer deployment adds the delivery-claim index.

Then grant the operator role. The TSW user must already exist:

```bash
pnpm --filter server instagram:operator -- your-tsw-login@example.com
```

Sign out and back in after changing the role. To revoke the role later:

```bash
pnpm --filter server instagram:operator -- your-tsw-login@example.com --revoke
```

Development operator granted on 4 September 2026: `instagram@gmail.com`.

## 5. Test the connection

1. Start the application and sign in to TSW as the operator user.
2. Open `/admin`, choose **Instagram publishing**, or go directly to
   `/admin/social/instagram`.
3. Choose **Connect Instagram** and sign in to the designated test professional account.
4. Review the two requested permissions and approve them.
5. Confirm the screen shows the expected username, account type, account ID, token expiry, and a
   recent verification time.
6. Choose **Verify connection** and confirm the time updates without publishing anything.
7. Test **Disconnect**, then reconnect once, confirming the old credential is removed locally.
8. Record the test date, account type, Graph version, and any Meta-specific behaviour in
   `platform-knowledge.md`. Never record a credential.

Completed on 4 September 2026: connection, server-side verification, disconnect, and reconnect all
succeeded through the deployed development application. The non-secret result is recorded in
`platform-knowledge.md`.

## 6. Run the first guarded demo delivery

- [x] Deploy the social-post and delivery code to development.
- [x] Run `pnpm --filter server instagram:ensure-indexes` in the development API Render Shell.
- [x] Create, review, and approve exactly one labelled demo game-card post.
- [x] Confirm the connected Instagram account is the designated test professional account.
- [x] Set `INSTAGRAM_PUBLISHING_ENABLED=true` on the development API and redeploy.
- [x] Queue that approved record from `/admin/social/instagram`.
- [x] Run `pnpm --filter server instagram:publish-pending` in the development API Render Shell.
- [x] Verify the post and recorded permalink, then set `INSTAGRAM_PUBLISHING_ENABLED=false` and
      redeploy.

Completed on 5 September 2026 against the development test professional account, using the
in-browser hand-off from The Pulse rather than a manually exported file. Record the non-secret
outcome in `platform-knowledge.md`.

## 7. Prepare the Meta App Review submission

Everything so far has worked because the test account sits in the app's **test roles**, which
grants Standard Access without review. Publishing to TSW's real Instagram account needs **Advanced
Access** to `instagram_business_basic` and `instagram_business_content_publish`, and that is an App
Review submission. Treat this as the long pole: it is a queue at Meta's end, measured in weeks, and
a rejection sends you back to the start of that queue.

Verify every requirement against Meta's current App Review documentation before submitting. The
requirements below were accurate at the time of writing and Meta changes them without notice.

### 7a. Business verification

- [ ] Complete Meta Business verification for the TSW business portfolio. This requires legal
      business name, registered address, and a verifiable phone number or public document. Start
      here: it gates the submission and is itself slow.
- [ ] Confirm the Meta app is owned by the verified business, not a personal account.

### 7b. Required public URLs

An app cannot go Live without these, and reviewers do open them.

- [x] **Privacy policy URL** — `https://thesportyway.com/privacy`, updated per step 7c.
- [x] **Terms of service URL** — `https://thesportyway.com/terms`. Built 5 September 2026 and
      linked from the site footer.
- [x] **Data deletion instructions URL** — `https://thesportyway.com/privacy#data-deletion`.
- [ ] App icon (1024x1024) and an accurate app category.
- [ ] Paste all three URLs into the Meta app's Basic Settings, then open each one **logged out, on
      the deployed site**, and confirm the deletion URL lands on the deletion section rather than
      the top of the page.

The anchors are load-bearing. `#data-deletion` and `#social-publishing` are element ids in
`PrivacyPage.jsx`, and `/terms` links to both. Renaming either silently breaks the Meta app
configuration, so `useHashScroll.test.jsx` and `TermsPage.test.jsx` guard them.

### 7c. Make the privacy policy cover what the app actually does

Reviewers check that the policy covers the data use behind each requested permission.

- [x] State that TSW publishes selected game content to TSW's own Instagram account.
- [x] State what is published: a rendered game-card image and a caption, both reviewed by a person.
- [x] State that TSW stores an Instagram access token for its own company account, encrypted, and
      that no end user's Instagram account is accessed.
- [x] Add Meta to the processor table.
- [x] Publish the deletion commitment, including the 7-day acknowledgement and 30-day completion
      window. **That window is now a public promise — confirm it is one TSW can keep.**

The terms of service carries the matching clause: the permission to publish league content to TSW's
own social accounts, and the opt-out. That clause is the contractual basis for the whole feature,
so keep the two pages consistent when either changes.

### 7d. Screencast and reviewer instructions

This is where most submissions fail. The reviewer must be able to reproduce the permission's use.

- [ ] Record a screencast that shows, unbroken and without cuts: signing in to TSW as the operator,
      opening `/admin/social/instagram`, connecting the Instagram account through Business Login,
      preparing a game card from The Pulse, the review screen with both declarations, approving,
      queueing, and the resulting published post with its permalink.
- [ ] Narrate or caption which permission each step exercises.
- [ ] Provide step-by-step written instructions matching the screencast exactly.
- [ ] Provide working test credentials for a TSW account that already holds `platform_operator`.
      The reviewer cannot grant themselves that role.
- [ ] Confirm the reviewer's path does not require the Render Shell. If delivery is still manual at
      submission time, say so explicitly in the instructions and show the queued state plus a
      previously published permalink rather than pretending it is automatic.
- [ ] **State which environment the reviewer is looking at.** The demonstration runs on the
      development app against the Instagram test account, because production publishing is
      deliberately disabled until this permission is granted — but the app's Basic Settings point at
      the production domain. A reviewer who has to work that mismatch out for themselves may reject
      the submission over it. Explaining it costs a sentence.

Two mismatches will be visible to the reviewer, and both are fine as long as the instructions name
them. Wording to adapt:

> The publishing workflow is demonstrated on our development environment at
> `https://dev.thesportyway.com`, signed in with the credentials supplied above, and publishes to
> our dedicated Instagram test account. Publishing from our production environment is deliberately
> disabled until this permission is granted, which is why the demonstration is not on
> `https://thesportyway.com`. Our privacy policy, terms of service, and data deletion instructions
> are published on the production domain and are linked from the footer of every page.
>
> Delivery is triggered by an operator rather than a scheduler: after approving a post, the operator
> queues it and a maintenance command publishes it. The screencast shows the queued state and the
> resulting published post with its Instagram permalink.

### 7e. Before pressing submit

- [ ] The app is in Live mode.
- [ ] Requested permissions are exactly `instagram_business_basic` and
      `instagram_business_content_publish` — nothing speculative. Extra permissions invite
      questions you have no use case for.
- [ ] The published content in the screencast is content TSW indisputably has the right to publish.
      A rejected submission over rights is expensive to unwind.

### 7f. Verify the public URLs on a real deployment

Local verification is not enough for these: the deployed build splits code differently, and the
fragment behaviour depends on when a route chunk arrives.

- [ ] Open `/privacy#data-deletion` **logged out, in a real browser**, on the deployed site.
      Confirm it lands on the deletion section rather than the top of the page. Repeat for
      `/privacy#social-publishing` and `/terms`.
- [ ] Confirm all three are reachable with no account and are linked from the footer.
- [ ] After the first draft on a fresh deployment, confirm in Cloudinary that the asset landed in
      `<CLOUDINARY_FOLDER>/social/instagram`, is named after the fixture, and carries the
      `tsw-social`, `tsw-social-instagram` and `tsw-game-<id>` tags. Then cancel a draft and confirm
      its asset is gone.

## 8. Production rollout, after review is approved

Do not start this until step 7 is granted.

- [ ] Register the production callback URL with Meta:
      `https://api.thesportyway.com/api/v1/social/instagram/oauth/callback` (confirm the exact
      production API hostname).
- [ ] Generate a **separate** production encryption key with `openssl rand -hex 32`. Never reuse the
      development key.
- [ ] Set the production secrets in the Render dashboard, not in `render.yaml`.
- [ ] Set `INSTAGRAM_OAUTH_ENABLED=true` on the production API (`render.yaml` currently pins it to
      `false`).
- [ ] Run `pnpm --filter server instagram:ensure-indexes` in the production API Render Shell.
- [ ] Grant `platform_operator` to the production operator account.
- [ ] Connect the real TSW Instagram account and verify, with publishing still disabled.
- [ ] Only then enable `INSTAGRAM_PUBLISHING_ENABLED` on production.

## What is left, and who does it

Everything that could be done in code is done. What remains needs a person, an account, or a
decision.

### Blocking the App Review submission

| #   | Action                                                           | Why it blocks                                           |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | Meta Business verification (step 7a)                             | Gates the submission and is itself slow. Start first.   |
| 2   | App icon and category (step 7b)                                  | An app cannot go Live without them.                     |
| 3   | Legal review of `/terms`                                         | It is a draft describing the product, not legal advice. |
| 4   | Screencast and reviewer instructions (step 7d)                   | Where most submissions fail.                            |
| 5   | A TSW test account holding `platform_operator`, for the reviewer | The reviewer cannot grant themselves the role.          |
| 6   | Verify the public URLs on the deployed site (step 7f)            | Fragment behaviour cannot be trusted from local.        |
| 7   | Deploy the legal pages to **production**                         | Meta's settings point at `thesportyway.com`.            |

### Decisions only TSW can make

- **Can the 30-day deletion window be met?** It is now published on `/privacy` and there is no
  automation behind it. If it cannot, change the page before submitting, not after.
- **The consent basis for real content.** Publishing is demo-only, enforced by
  `contentDeclaration: z.literal('demo')`. That is fine for App Review, which is demonstrated
  against demo content. It becomes the blocker the day a real league game should go out. See the
  consent section of [`policy.md`](./policy.md), including the under-18 position.
- **Scheduled delivery.** There is no cron service; `instagram:publish-pending` is a person running
  a Render Shell command. Acceptable while volume is low, but say so in the reviewer instructions
  rather than implying delivery is automatic.

### Not yet safe to do

- Do not connect the production Instagram account until App Review grants Advanced Access.
- Do not publish content featuring identifiable real participants until the consent position in
  [`policy.md`](./policy.md) is settled and recorded.
- Do not grant `platform_operator` to league or team administrators who do not operate TSW's
  company social account.
