# Pulse Media Safety Hold

## Current Release Boundary

Recorded on **11 September 2026 at 12:31 BST**.

Creation of new user-supplied image and video posts in The Pulse is disabled as
a fail-closed short-term safety measure:

- the composer exposes only game, player, and team card posts;
- authenticated `POST /feed/image` and `POST /feed/video` requests return 403;
- the API rejection occurs before multipart parsing and before any Cloudinary
  upload;
- existing image and video posts remain readable so historical feed content is
  not broken;
- structured game, player, team, highlight, milestone, and automatic feed posts
  retain their existing behaviour and authorization rules.

The service-layer image/video creation and historical rendering code remains in
place for the future moderated implementation, but no HTTP or client creation
path reaches it during this hold.

## Re-enable Gate

Do not restore either raw-media creation route until all of the following are
implemented and tested:

1. New media posts enter a non-public `pending` state and feed queries return
   only `approved` posts.
2. Pending Cloudinary assets cannot be delivered publicly or exposed through
   an API response.
3. Image and video moderation callbacks are authenticated, idempotent, and can
   move posts to `approved` or `rejected` while cleaning up rejected assets.
4. Users can report a post and select a reason.
5. Platform operators have a review queue, an audit trail, and controls to
   remove content and restrict abusive accounts.
6. Posting has dedicated per-user rate limits and appropriate trust checks.
7. Automated and manual tests prove that pending/rejected media never appears
   in public or authenticated feed responses.
8. The content rules, moderation behaviour, reporting route, operator runbook,
   and applicable online-safety risk records are updated.

Re-enabling must change the client and both API routes together. Hiding client
controls alone is not sufficient.
