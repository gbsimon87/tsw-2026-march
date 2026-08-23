# Instagram Connection: Manual Actions

These are the actions that cannot be completed in source code because they require the TSW Meta
account, Instagram account, deployment secrets, and a real application user. Complete development
first; leave production disabled until the test account flow is proven.

## 1. Prepare the Instagram account

- [ ] Use a dedicated non-production Instagram **Business or Creator** account for the first test.
- [ ] Confirm the person performing setup can sign in to that Instagram account.
- [ ] Do not send the username, password, app secret, access token, or encryption key in chat.

## 2. Configure Meta

- [ ] Create or select the TSW Meta developer Business app.
- [ ] Add **Instagram API with Instagram Login**.
- [ ] In Business Login settings, add this exact local redirect URL:
      `http://localhost:4000/api/v1/social/instagram/oauth/callback`.
- [ ] Add the exact deployed development callback URL:
      `https://<development-api-host>/api/v1/social/instagram/oauth/callback`.
- [ ] Add the test professional account to the app's test roles and accept any invitation from the
      Instagram account.
- [ ] Keep the initial permissions to `instagram_business_basic` and
      `instagram_business_content_publish`.
- [ ] Record the Instagram App ID. Put the App Secret only in the local environment/deployment
      secret store.

Meta requires redirect URL equality. Scheme, hostname, port, path, and trailing slash must match
the server value exactly.

## 3. Configure the development server

Choose a Graph API version currently supported by the Meta app; do not use `latest`. Generate the
encryption key locally with `openssl rand -hex 32`, then store it securely. Losing or changing this
key without a rotation makes the saved access token unreadable.

Set the following in `env/server/.env.development` or the development deployment's secret store:

```dotenv
INSTAGRAM_OAUTH_ENABLED=true
INSTAGRAM_GRAPH_API_VERSION=vN.N
INSTAGRAM_APP_ID=replace-with-instagram-app-id
INSTAGRAM_APP_SECRET=replace-in-secret-store
INSTAGRAM_OAUTH_REDIRECT_URL=http://localhost:4000/api/v1/social/instagram/oauth/callback
INSTAGRAM_TOKEN_ENCRYPTION_KEY=replace-with-64-hex-characters
INSTAGRAM_TOKEN_KEY_VERSION=v1
INSTAGRAM_PUBLISHING_ENABLED=false
```

Use the deployed development callback instead of localhost when testing the hosted app. Keep
`INSTAGRAM_PUBLISHING_ENABLED=false`; this milestone does not need it.

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

## Not Yet Safe to Do

- Do not connect the production Instagram account until the test account succeeds.
- Do not enable live publishing or attempt a real post through ad hoc API calls.
- Do not grant `platform_operator` to league or team administrators who do not operate TSW's
  company social account.
