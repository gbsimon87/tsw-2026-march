# TSW Execution Plan

Date: 2026-03-17

## Current State

TSW is beyond the original v1 scaffold stage. The product already supports the core tracked-team workflow end to end:

- auth and account flows
- team creation and roster management
- game creation, live event tracking, finish/save flow
- derived box scores, recap, replay, and public team/player pages
- public feed and shareable card flows
- team-level billing foundations for Pro-gated features

The main near-term risk is no longer missing baseline functionality. It is drift between shipped behavior, monetization, deployment confidence, and repo documentation.

## Done Recently

- Opponent scoring totals were added through event-derived scoring rather than a second opponent roster model.
- Final scorelines now flow through game detail, recap, recap cards, and public score surfaces.
- `STL`, `TOV`, and `FOUL` are supported in core stat summaries and public reporting surfaces.
- Game detail includes a baseline print mode via `/games/:gameId?print=1`.
- Billing has checkout, customer portal, webhook handling, entitlement resolution, and local replay/idempotency test coverage.
- Public opponent placeholder routing already exists and should remain the base for any future opponent identity expansion.

## Current Priorities

1. Harden billing reliability and deployment readiness.
2. Refine live tracking recovery and in-game reliability.
3. Finish print output polish for usable browser print-to-PDF.
4. Align README, roadmap, and older planning docs with the real product state.

## Milestones

### Milestone 0: Execution Source of Truth

Status: `Done`

#### Why it matters

Without a current operational plan, later work gets tracked against stale or contradictory docs.

#### Scope

- Replace the old status snapshot with a milestone-driven execution document.
- Mark shipped items as `Done` or `In Progress`, not future work.
- Keep broader README and roadmap cleanup as a later milestone.

#### Acceptance criteria

- One working execution doc exists.
- It reflects current implementation state.
- It is structured to be updated as milestones move.

#### Open risks

- README, roadmap, and historical planning docs still contain contradictions that must be cleaned up later.

#### Next update

- Re-rank priorities after billing reliability work lands.

### Milestone 1: Billing Reliability and Deployment Readiness

Status: `In Progress`

#### Why it matters

Replay and public shot maps are already monetized surfaces. Billing failures or ambiguous entitlement states are higher-severity problems than moderate product friction.

#### Scope

- Tighten webhook replay/idempotency handling.
- Prevent unnecessary repeated billing side effects on replayed events.
- Validate checkout flow for free teams.
- Validate billing portal flow for already-Pro teams.
- Validate entitlement refresh after billing redirects.
- Verify environment contracts for Stripe and Cloudinary.
- Produce a short deployment checklist.

#### Acceptance criteria

- Replayed webhooks do not trigger duplicate state transitions.
- Free teams can enter checkout correctly.
- Pro teams open the billing portal correctly.
- Gating reflects backend entitlements after webhook processing.
- Required billing/media env configuration is documented.

#### Open risks

- Local tests are not the same as staging/prod Stripe validation.
- Current event replay protection is still team-scoped, not a dedicated webhook-event store.

#### Next update

- Confirm whether staging validation has been completed.

### Milestone 2: Tracking Workflow Reliability

Status: `Ready Next`

#### Why it matters

Live tracking is the highest-frequency user workflow and still has the biggest repeated-friction surface during real games.

#### Scope

- Validate undo-last-event across all event types.
- Refine recent-event deletion and correction flow.
- Make assist/rebound follow-up dismissal clearer.
- Improve duplicate-tap prevention and save-state messaging.
- Improve mobile ergonomics.
- Keep correction scoped to delete-and-reenter, not inline event editing.

#### Acceptance criteria

- Undo works consistently for team and opponent events.
- Recent event deletion remains safe and understandable.
- Prompt cancellation is explicit and recoverable.
- Save failures leave the tracker usable.
- Mobile tracking remains fast and readable.

#### Open risks

- Event chronology and summary recalculation regressions.
- Tracker controls can become slower if the UI grows without restraint.

#### Next update

- Re-check tracker UX once billing reliability work is stable.

### Milestone 3: Output Polish, Not Output Expansion

Status: `Ready Next`

#### Why it matters

Print mode already exists. The remaining work is to make it clean enough for actual coach/parent print-to-PDF use.

#### Scope

- Tighten print CSS and spacing.
- Remove app chrome from print output.
- Keep score, metadata, and box score readable on standard paper widths.
- Do not start CSV/export pipelines in this milestone.

#### Acceptance criteria

- Print-to-PDF is clean and legible.
- Share/feed/navigation controls do not leak into print mode.
- Long names and wide tables remain usable.

#### Open risks

- Print CSS can turn into a time sink if it tries to mirror the interactive page too closely.

#### Next update

- Validate print output against a completed game with a long roster.

### Milestone 4: Documentation Alignment

Status: `Ready Next`

#### Why it matters

The repo currently understates shipped scope and leaves contradictory implementation guidance in multiple docs.

#### Scope

- Update `README.md`.
- Update `ROADMAP.md`.
- Update or annotate older planning docs that still contradict shipped behavior.
- Keep one active execution doc, one current-product overview, and one directional roadmap.

#### Acceptance criteria

- Shipped items are no longer described as planned.
- Contradictory docs are either revised or explicitly marked historical.
- README reflects the actual current product surface.

#### Open risks

- Historical docs can continue to confuse future work if they are left half-updated.

#### Next update

- Clean up roadmap wording once the next product milestone is validated.

### Milestone 5: Reporting and Analytics Expansion

Status: `Deferred`

#### Scope

- richer trend views
- season rollups
- better summary surfaces
- clearer synthesis in recap and public reporting

#### Why deferred

This is useful, but it is lower urgency than billing reliability, tracking recovery, and print polish.

### Milestone 6: Broader Product Expansion

Status: `Deferred`

#### Scope

- opponent roster/player tracking
- seasons and season entities
- coach/staff/org permissions
- richer social features
- media and video workflows

#### Why deferred

These are broader product bets, not near-term practical-value fixes.

## Deferred / Later

- CSV export pipelines
- advanced shot-zone analytics
- opponent player-level support
- organization-level permissions
- embedded video and time-synced tracking

## Update Rules

- When a milestone ships, move its key outcomes into `Done Recently` and update its status.
- Do not leave shipped work written in future tense.
- Re-rank priorities after each milestone closes.
- If a task expands beyond the intended milestone scope, split it into a new milestone rather than silently bloating the current one.
- Keep milestone notes focused on shipped behavior, remaining work, and the next concrete validation step.
