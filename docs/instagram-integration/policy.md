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

Social exports upload to `<CLOUDINARY_FOLDER>/social/instagram` — `tsw/feed/prod/social/instagram`
in production — rather than the shared feed folder. The prefix is derived from the existing
environment folder, so there is nothing extra to configure per deployment, and it makes retention,
audit and deletion addressable as a set without touching ordinary user feed images.

Each asset is named after the fixture rather than taking Cloudinary's random id —
`portland-trailblazers-vs-wildcats-2026-09-05-<random>` — so the folder is browsable and a deletion
request can be answered without opening images one by one. Only team names and the played date go
into the name. A player's name never does: the top scorer is already on the card without also being
in its public address.

Each asset also carries tags, which are what make a set deletable in one call:

| Tag                    | Selects                           |
| ---------------------- | --------------------------------- |
| `tsw-social`           | every social export, any platform |
| `tsw-social-instagram` | every Instagram export            |
| `tsw-game-<gameId>`    | every export for one fixture      |

Cloudinary can delete by tag directly (Media Library, or `DELETE /resources/image/tags/<tag>`), so
withdrawing one game does not mean hunting for its ids.

Assets uploaded before 5 September 2026 remain in the shared folder with random ids. There are none
in production, and the development ones are demo content, so no migration is planned.

## Retention

- **Cloudinary asset.** Kept while the social post record is live, because Meta fetches the URL
  during container creation and may re-fetch during retries and reconciliation. A short-lived or
  signed URL will break publication.
- **Cancelled drafts.** Cancelling from `draft`, `ready_for_review` or `approved` destroys the
  stored image with the record: nothing at Meta references the URL yet. Cancelling from `queued` or
  `failed` keeps it, because a container may already point at that URL and reconciliation still
  needs it to resolve. Deletion is best effort — a storage failure never turns a successful
  cancellation into an error, so an orphaned asset is possible and acceptable.
- **Records outlive their assets.** A cancelled record keeps its `asset.url` for audit, and that
  URL stops resolving. The review queue detects the broken image and says so rather than showing a
  dead thumbnail.
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
