# Instagram Publishing: Content, Retention and Deletion Policy

This is the policy the Instagram integration is built to, and the source for the public wording
Meta App Review requires. `architecture.md` flagged that social exports needed a deliberate upload,
retention and deletion position before the pipeline was connected; this is that position.

Anything marked **OPEN** is a decision that has not been made yet and blocks the step it names.

## What TSW publishes

- A rendered 1080x1350 PNG of a TSW game card, and a caption. Nothing else leaves the platform.
- The image is produced from data already visible on a public TSW page, and links back to it.
- Publication is to **TSW's own** Instagram account. The integration never posts to, reads from, or
  acts on behalf of any end user's Instagram account.

## What is stored, and where

| Artefact                     | Location                        | Contains                                                                      |
| ---------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| Rendered card image          | Cloudinary, `CLOUDINARY_FOLDER` | Team names, scores, player name of the top scorer, team logo                  |
| `InstagramSocialPost` record | MongoDB                         | Caption, attribution URL, asset URL and SHA-256, operator ids, delivery state |
| Instagram access token       | MongoDB, AES-256-GCM encrypted  | TSW's own company account credential                                          |
| Published post               | Instagram                       | The image and caption, publicly                                               |

Note that social exports currently upload into the **same Cloudinary folder as ordinary user feed
images** (`tsw/feed/prod`). They are not separable by prefix, which makes a targeted retention rule
impossible to express today.

**OPEN — blocks step 8 of `manual-actions.md`.** Give social exports their own folder
(`tsw/social/instagram/<env>`) so retention, audit and deletion can address them as a set. This is
a small change to the upload call, but it must happen before production assets accumulate in the
shared folder, because it cannot be applied retroactively without moving files.

## Retention

- **Cloudinary asset.** Kept while the social post record is live, because Meta fetches the URL
  during container creation and may re-fetch during retries and reconciliation. A short-lived or
  signed URL will break publication.
- **Cancelled or failed drafts.** The asset is already destroyed on the failure path in
  `createDraft`. A draft that is cancelled after upload currently keeps its asset.
  **OPEN:** decide whether cancellation should destroy the asset. It should, but the delivery
  worker's reconciliation path must be checked first — destroying an asset for a post that Meta has
  in fact accepted would leave a published post with a dead source URL.
- **Published posts.** The record is the audit trail of who approved what, and is kept
  indefinitely. It is operational data about TSW staff, not about players.
- **Access token.** Held until disconnect or revocation, then removed.

## Deletion

Two different things get confused here; keep them apart.

**Deleting a published Instagram post.** Done in Instagram, by a person. TSW does not currently
have a delete-media path, and does not need one for App Review. The stored record keeps the
permalink so a deleted post can be reconciled by hand.

**A person asking TSW to delete their data.** Covered by the existing rights section of the privacy
policy. For Instagram specifically:

- If a player asks to be removed, and a published post names or depicts them, TSW deletes the
  Instagram post, destroys the Cloudinary asset, and cancels the record.
- There is no automated path for this. It is a manual runbook action, and that is acceptable at
  current volume, but it must be written down as a commitment rather than assumed.

**OPEN — blocks step 7b of `manual-actions.md`.** Meta requires a Data Deletion Callback or a Data
Deletion Instructions URL. TSW has neither. The cheaper option is an instructions URL: a stable
anchor on `/privacy` stating how to request deletion, what is deleted, and the response time. Agree
the response time before publishing it, because it becomes a public commitment.

## Consent and rights

This is the part most likely to cause a problem, and it is currently sidestepped rather than
solved.

Today the system **can only record demo content**: `contentDeclaration` is `z.literal('demo')` in
`instagram.social-post.validation.js`, and the operator must additionally confirm the content shows
no identifiable real participant. That is a deliberate guard while the pipeline is proven, and it
is why the workflow is safe to demonstrate to Meta today.

**OPEN — blocks publishing anything real.** Publishing actual league games means:

- a lawful basis for publishing a named player's performance to a public social account;
- a position on under-18 players, which is materially stricter and is a realistic share of a
  basketball league's participants;
- whether consent is collected at league level, team level, or per player, and where it is recorded;
- an opt-out that is honoured for content already published; and
- widening `contentDeclaration` beyond `'demo'`, with the new value recorded in the content digest
  so an approval remains an approval of a specific rights basis.

Until that is settled, the demo-only guard stays. Do not widen the schema as a convenience.

## Why publication stays human-approved

The approval gate is not ceremony. It is the control that makes every statement above true: a
person confirms the rights basis for this specific image before it leaves TSW. Automating drafting
is possible; automating **approval** removes the only check that content is lawful to publish, and
would make the App Review submission harder to defend rather than easier.

See `decisions.md` for the recorded decision, and `architecture.md` for how the digest binds an
approval to exact bytes.
