# Instagram Platform Knowledge

Last checked against Meta's official Instagram API workspace and the deployed development OAuth
flow on **4 September 2026**.

## Development OAuth Validation — 4 September 2026

- Meta app type: Business, using Instagram API with Instagram Login.
- Graph API version: `v26.0`.
- OAuth callback: `https://dev-api.thesportyway.com/api/v1/social/instagram/oauth/callback`.
- TSW development operator login: `instagram@gmail.com`.
- Test professional account role invitation accepted.
- OAuth completed successfully and the operator screen reported the account as connected.
- Server-side verification succeeded, and disconnect followed by reconnect completed successfully.
- Meta's dashboard token generator returned no visible token after login; this was not a blocker
  because TSW's OAuth flow obtained, exchanged, encrypted, and stored its own credential.
- Webhooks were not configured, and the Meta app remained in Development mode.

No Instagram username, external account ID, access token, app secret, or encryption key is recorded
in this repository.

## Chosen API Path

Use the **Instagram API with Instagram Login** for the first integration. It connects Instagram
professional accounts directly and does not require the account to be linked to a Facebook Page.
That is a better fit for TSW's initial requirement: publish owned media to one Business or Creator
account.

This path does not provide advertising or tagging capabilities. Those are not required for the
first release. Revisit the choice before adding capabilities outside owned organic publishing.

Initial permissions:

- `instagram_business_basic`
- `instagram_business_content_publish`

Do not request messaging or comment-management permissions until a product feature requires
them. Each additional scope increases review and security obligations.

## OAuth Connection Flow

The operator flow uses Business Login for Instagram:

1. Redirect the operator to `https://www.instagram.com/oauth/authorize` with the Instagram App ID,
   exact callback URL, `response_type=code`, the two scopes above, and a one-time `state`.
2. Exchange the callback code with a form-encoded `POST` to
   `https://api.instagram.com/oauth/access_token`.
3. Exchange the short-lived credential for a long-lived credential through
   `https://graph.instagram.com/access_token` with `grant_type=ig_exchange_token`.
4. Verify the returned Instagram professional account using the versioned Graph API before saving
   the connection.

Meta's short-token response can represent `user_id` as an unquoted JSON number even though an
Instagram ID can exceed JavaScript's safe-integer range. The server preserves the exact digit
sequence from the raw response body before constructing Graph paths.

The long-lived-token exchange requires the short-lived token in its query string. This is a
platform-contract exception to TSW's normal bearer-header rule; the exchange URL is never logged,
returned, or attached to an error. Normal Graph calls continue to use `Authorization: Bearer`.

## Publishing Flow

For a configured Instagram professional account ID:

1. Create an image or Reel container with `POST /{ig-user-id}/media`.
2. For a Reel, send `media_type=REELS`, a public `video_url`, the caption, and an explicit
   `share_to_feed` value.
3. Read `GET /{container-id}?fields=status_code,status` until `status_code=FINISHED`.
4. Treat `ERROR` and `EXPIRED` as terminal container failures.
5. Publish with `POST /{ig-user-id}/media_publish` and `creation_id={container-id}`.
6. Persist the returned media ID. A later slice should retrieve and persist its permalink.

The implementation uses `https://graph.instagram.com/{api-version}/...` and sends the access
token as an `Authorization: Bearer` header.

## Media Requirements That Affect TSW

- Media must be reachable by Meta over public HTTPS while it creates and processes the container.
- Browser-only blobs, local files, localhost, and authenticated URLs are unsuitable.
- Images, videos/Reels, and carousels are supported for professional accounts; this slice covers a
  single image and a single Reel.
- Keep API version configuration explicit. Do not silently follow a moving `latest` version;
  review Meta's version lifecycle, test, and deliberately update the configured `vN.N` value.
- Validate the final export against Meta's current format and size requirements during the live
  test phase. Client-side prechecks improve feedback but do not replace Meta's response.

## Operational Assumptions to Validate Live

- The connected account is Business or Creator and owns the content being published.
- App review and advanced access requirements for the chosen permissions are satisfied before
  production users are involved.
- The selected token type and exchange flow provide a workable renewal window.
- Container processing completes within the job's poll/reconciliation window.
- The account's current publishing limits and platform-policy constraints are compatible with
  TSW's planned two-post-per-week cadence.

Do not encode uncertain platform limits as product promises. Record the exact behaviour observed
in the private test account here when the OAuth and end-to-end test slices are completed.

## Official References

- [Meta Instagram API workspace](https://www.postman.com/meta/instagram/overview)
- [Instagram API with Instagram Login collection](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login)
- [Create and publish media guide](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api?entity=request-23987686-894be833-d0b6-4877-859e-c61ae6474d64)
- [Create a Reel container](https://www.postman.com/meta/instagram/request/23987686-8d93f052-4c50-4cef-b23e-57732bf370f3)
- [Get container status](https://www.postman.com/meta/instagram/request/munmruq/get-ig-container-status)

Meta's reference material changes. Recheck these sources before app review, before changing Graph
API versions, and before introducing a new media type.
