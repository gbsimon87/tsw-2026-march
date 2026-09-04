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

Keep `INSTAGRAM_PUBLISHING_ENABLED=false`; this milestone does not need it. Secret values belong in
the Render environment and must not be added to `render.yaml` or committed environment files.

## 4. Grant your TSW user operator access

Create the database indexes once per environment. This is required because production deliberately
disables automatic Mongoose index creation:

```bash
pnpm --filter server instagram:ensure-indexes
```

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

## Not Yet Safe to Do

- Do not connect the production Instagram account until the test account succeeds.
- Do not enable live publishing or attempt a real post through ad hoc API calls.
- Do not grant `platform_operator` to league or team administrators who do not operate TSW's
  company social account.
