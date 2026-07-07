# 04 — Technical Debt

> Debt discovered during this initiative's investigation that isn't the
> direct root cause of any TSW-### task, but is worth tracking and fixing
> opportunistically (usually while a related task is already touching the
> same file).

---

## Swallowed errors hide real failure causes (client-side)

**Found in:** `client/src/features/games/pages/GameDetailPage.jsx:797-801`
(the "Share to Pulse" handler — root cause context for TSW-001).

```js
} catch (err) {
  const msg = err.message?.toLowerCase().includes('already been shared')
    ? 'Already shared'
    : 'Failed to share';
  setClipShareState((s) => ({ ...s, [eventId]: msg }));
}
```

This pattern — catch a server error, throw away its actual message, and show
a generic string — makes any bug in this code path nearly impossible to
diagnose from the client alone; someone has to reproduce it and check the
network tab or server logs by hand every time. **Being fixed as part of
TSW-001** (surface + log the real error). Worth checking whether this same
pattern exists in other mutation handlers across the client — not audited
here, flagged for a future pass if this class of bug recurs elsewhere.

---

## Duplicated game-card display-derivation logic

**Found in:** `client/src/features/feed/components/posts/GameCardPost.jsx`
and `client/src/features/feed/components/posts/FullScreenGameCard.jsx` —
the `homeName`/`awayName`/`homePoints`/`awayPoints`/`isWinner` derivation
(isDualTeam branching + winner comparison) is duplicated verbatim between
the two files.

**Being fixed as part of:** TSW-004 (extracting into a shared helper while
that task is already touching both files for the `recap` field fix).

---

## No refresh trigger for player/team card snapshots

**Found in:** `server/src/modules/feed/feed.service.js` — see
[`02_ARCHITECTURE_NOTES.md`](./02_ARCHITECTURE_NOTES.md#card-snapshot-staleness-has-no-consistent-refresh-story)
for the full pattern-level note. Tracked as a possible sub-scope of TSW-004
or a follow-up task, depending on how much design the refresh trigger needs
(see TSW-004's tracker card).

---

## Partial/hinted league-awareness in `feed.service.js` not used by the composer

**Found in:** `feed.service.js:31` imports `findLeaguePlayerById` from
`leagues.repository` for use elsewhere in the file (rendering an existing
highlight-clip/player-card that references a league player), but the
composer's own `listShareable*` search/browse functions don't use it or any
other league query. Not a bug — just an inconsistency worth being aware of
when implementing TSW-005: there's already a working example of querying a
league player by ID elsewhere in the same file to model the new query
branches on.
