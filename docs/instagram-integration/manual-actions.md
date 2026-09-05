# Instagram Connection: Manual Actions

These are the actions that cannot be completed in source code because they require the TSW Meta
account, Instagram account, deployment secrets, and a real application user. Complete development
first; leave production disabled until the test account flow is proven.

## 1. Prepare the Instagram account

- [x] Use a dedicated non-production Instagram **Business or Creator** account for the first test.
- [x] Confirm the person performing setup can sign in to that Instagram account.
- [ ] Do not send the username, password, app secret, access token, or encryption key in chat.

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

- [ ] **Privacy policy URL** — `https://thesportyway.com/privacy` exists. It must be updated first;
      see step 7c.
- [ ] **Terms of service URL** — _TSW does not currently have one._ A `/terms` route must be built
      and published before submitting.
- [ ] **Data deletion** — either a Data Deletion Request Callback or a Data Deletion Instructions
      URL. See [`policy.md`](./policy.md) for what TSW commits to and the wording to publish.
- [ ] App icon (1024x1024) and an accurate app category.

### 7c. Make the privacy policy cover what the app actually does

Reviewers check that the policy covers the data use behind each requested permission. The current
policy predates Instagram publishing and does not mention it.

- [ ] State that TSW publishes selected game content to TSW's own Instagram account.
- [ ] State what is published: a rendered game-card image and a caption, both reviewed by a person.
- [ ] State that TSW stores an Instagram access token for its own company account, encrypted, and
      that no end user's Instagram account is accessed.
- [ ] Link the retention and deletion commitments in [`policy.md`](./policy.md).

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

### 7e. Before pressing submit

- [ ] The app is in Live mode.
- [ ] Requested permissions are exactly `instagram_business_basic` and
      `instagram_business_content_publish` — nothing speculative. Extra permissions invite
      questions you have no use case for.
- [ ] The published content in the screencast is content TSW indisputably has the right to publish.
      A rejected submission over rights is expensive to unwind.

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

## Not Yet Safe to Do

- Do not connect the production Instagram account until App Review grants Advanced Access.
- Do not publish content featuring identifiable real participants until the consent position in
  [`policy.md`](./policy.md) is settled and recorded.
- Do not grant `platform_operator` to league or team administrators who do not operate TSW's
  company social account.
