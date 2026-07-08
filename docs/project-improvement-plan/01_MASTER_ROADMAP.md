# 01 — Master Roadmap

> Dependency graph and execution ordering for the TSW Project Improvement
> Initiative. See [`00_IMPLEMENTATION_TRACKER.md`](./00_IMPLEMENTATION_TRACKER.md)
> for live status; this file explains the **why** behind the ordering.

## Dependency graph

```
TSW-003 (nav title)         — independent, no deps
TSW-004 (FullScreen stats)  — independent, no deps
TSW-002 (mobile scroll)     — independent, no deps (sequenced after TSW-004
                               only for file-adjacency convenience)
TSW-001 (share to pulse)    — independent, no deps (but needs a
                               prod-investigation sub-step before its final
                               fix can be scoped)
TSW-005 (FeedComposer)      — soft dependency on TSW-004 (shares
                               card-rendering touchpoints; doing TSW-004
                               first avoids editing the same components in
                               two overlapping passes)
```

None of the 5 tasks have a **hard** dependency on another — each is
independently fixable. The ordering below is a risk/cost sequencing decision,
not a technical blocker.

## Execution order: TSW-003 → TSW-004 → TSW-002 → TSW-001 → TSW-005

1. **TSW-003 first** — the cheapest, most isolated fix (one Zod default
   string). Zero risk of touching shared code other tasks need.

2. **TSW-004 second** — root cause is fully confirmed (a single missing
   field in one server-side builder function). Low risk, high user-visible
   impact (shared cards showing 0-0 is a bad look). Doing it early also means
   TSW-005 doesn't have to duplicate work on the same rendering components.

3. **TSW-002 third** — low risk, and its only file (`GameRecapPanel.jsx`) is
   adjacent to code TSW-004 may also touch (both are in the game-recap/
   feed-card rendering neighborhood) — sequencing this right after TSW-004
   avoids re-reading the same file twice cold.

4. **TSW-001 fourth** — this is the only task that can't be fully scoped from
   static code alone. It needs a look at real production error data before
   the actual fix (beyond the error-surfacing improvement, which is
   unconditional) can be finalized. Doing the cheaper, fully-scoped tasks
   first means this investigation step doesn't block anything else.

5. **TSW-005 last** — the largest task (Complexity: L), and the one place
   where doing another task first (TSW-004) genuinely reduces the work: the
   card-rendering components TSW-005 will need to extend for league entities
   are the same ones TSW-004 fixes. Fixing the bug before extending the
   feature avoids building the extension on top of a known-broken snapshot
   shape.

## What would change this order

- If TSW-001's production investigation turns out to be quick (e.g., the team
  already has the failed request's `requestId` logged and can check it
  immediately), it could move earlier — nothing here prevents parallelizing
  investigation with TSW-003/004 implementation.
- If TSW-004's staleness-refresh sub-scope (see its tracker card) turns out
  to need real design discussion, it could be split into its own follow-up
  task (e.g. `TSW-004b`) rather than block TSW-004's core fix — mirrors how
  the OPT-### tracker split `OPT-014`/`OPT-014b` when a task's remaining
  scope diverged in risk from its core.
