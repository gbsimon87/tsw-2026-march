# 02 — Architecture Notes

> Durable, pattern-level findings from this initiative worth keeping around
> after the individual tasks ship — the kind of lesson that should inform
> future code in this area, not just fix today's bug. Update this file
> whenever a task surfaces something like this (per
> [`00_IMPLEMENTATION_TRACKER.md`](./00_IMPLEMENTATION_TRACKER.md)'s
> instructions).

---

## Snapshot builders must mirror their live-compute counterpart's fields exactly

**Discovered during:** TSW-004 investigation.

**The pattern:** OPT-017 introduced a "compute once, persist as a snapshot,
serve the snapshot on subsequent reads" pattern for feed cards
(`buildGameCardSnapshot`/`buildPlayerCardSnapshot`/`buildTeamCardSnapshot` in
`feed.service.js`), with a documented **live-compute fallback** when a
snapshot is missing — the same builder functions are meant to be "one source
of truth for the shape either way" (see the comment at `feed.service.js:142-145`).

**Where it broke:** `buildGameCardSnapshot()` omits a field (`recap`) that
the **live** path (`getPublicGame()` → `buildGameRecap`) does produce. The
client components only know one field name to read
(`gameCard.recap.points`), so they silently degrade to `0` whenever the data
came from the snapshot path instead of the live path — no error, no crash,
just wrong numbers. This is the kind of bug that's easy to miss in testing
because a freshly-created card (which hasn't gone through the snapshot
persistence path yet, or was tested via the live-compute fallback) renders
correctly; only a card that's actually round-tripped through the cache
manifests the bug.

**The lesson:** when a "snapshot vs. live-compute-fallback" pair exists,
**the snapshot builder's output shape must be verified against every field
the consuming component actually reads** — not just against what the
original author remembered to include. A single shared type/shape
(TypeScript would catch this automatically; in this plain-JS codebase, a
short comment listing every consumed field next to each builder, or a
snapshot test asserting the exact key set, would catch it).

**Where this pattern exists elsewhere in the codebase** (worth spot-checking
if touching any of these): `buildPlayerCardSnapshot`/`buildTeamCardSnapshot`
(same file — checked during this investigation, found correct);
`Game.boxScore`/`Game.gameSummary` frozen fields (OPT-012, `games.service.js`)
follow the same snapshot+fallback shape and should be checked the same way if
ever extended.

---

## Card snapshot staleness has no consistent refresh story

**Discovered during:** TSW-004 investigation (secondary finding).

**The gap:** `refreshGameCardPostsForGame` exists specifically for **game**
cards (triggered when a game's score changes post-completion), but no
equivalent exists for **player** or **team** cards — their snapshots are
computed once at share time and never automatically refreshed, even though
the underlying player/team stats can keep changing indefinitely after the
card was shared.

**Why this matters beyond the immediate bug:** this is a design gap, not
just a missing function call — "when should a shared card's snapshot be
considered stale enough to refresh?" doesn't currently have an answer for
2 of the 3 card types. If this is addressed (see TSW-004's tracker card),
the answer should be written down here once decided, so the next card type
added to the feed doesn't repeat the same oversight.

---

## League vs. standalone entities are genuinely separate collections, not a shared-schema-with-a-flag

**Discovered during:** TSW-005 investigation.

**The fact:** `LeagueTeam` and `LeaguePlayer` (`leagues.repository.js:50,64,87`)
are entirely separate Mongoose collections from `Team`/standalone players —
not the same collection with a `leagueId` field distinguishing scope. This
matters for **any** future feature that needs to treat league and standalone
entities uniformly (FeedComposer being the current example): there is no
single query that returns "all teams a user can post about" — it always
requires querying two different collections and merging, or building a
scope-aware branch.

**Why this is worth recording:** if a future task assumes "just add a filter"
will make a standalone-only feature league-aware, this note should redirect
them to actually check which collection(s) are involved first.
