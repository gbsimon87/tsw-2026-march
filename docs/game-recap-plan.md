# Game Recap MVP Plan: Share-Friendly Recap Inside Game Detail

## Status

Historical planning document.

This plan described the original recap MVP assumptions before opponent score totals, expanded stat categories, print mode, and billing hardening landed in the app. Use it for background context only. Current execution status lives in [docs/status-snapshot-2026-03-17.md](/Users/simoncordova/Desktop/Simon/tsw-2026-march/docs/status-snapshot-2026-03-17.md), and current product framing lives in [README.md](/Users/simoncordova/Desktop/Simon/tsw-2026-march/README.md) plus [ROADMAP.md](/Users/simoncordova/Desktop/Simon/tsw-2026-march/ROADMAP.md).

## Summary

Implement a first version of automatic game recaps as a new section inside the existing game detail experience, optimized for parents and families, and designed to become a sharing surface.

This MVP should:

- generate recap data automatically from the existing event-sourced game model
- live inside the current game detail page as a new `Recap` tab
- be free at the basic level to preserve virality
- use deterministic summary rules, not AI-written copy
- show final score based on the current derived score model
- provide a share-friendly public experience first
- defer downloadable image export and richer premium visuals to a later phase

The core product goal is:
`Game tracked -> recap generated -> shared -> new viewer reaches full stats / product`

## Product Decisions Locked

### Audience

Primary audience for v1:

- parents
- families
- casual supporters

This means the recap should favor:

- visual clarity
- low text density
- strong headline stats
- simple highlight moments
- obvious share CTA

It should not read like a scouting report or dense analytics dashboard.

### Placement

The recap should live inside the existing game detail page as a new tab:

- existing route remains `/games/:gameId`
- add a new `Recap` tab to the current tab set

This avoids adding a parallel page structure in v1 and reuses the current public game page URL that is already shareable.

### Monetization

For v1:

- basic recap is free
- richer recap visuals later can be Pro

Free recap should include:

- final score when opponent totals exist
- top performers
- team stat summary
- key moments
- CTA to share or copy link

Defer Pro recap additions such as:

- stylized premium shot-chart recap visuals
- downloadable branded image exports
- alternate templates
- player-specific recap cards

### Key Moments Strategy

Use deterministic event rules only.

Do not add:

- manual highlight picking
- LLM-generated game stories
- narrative AI commentary

Key moments should be selected from existing events and timestamps using explicit business rules.

### Score Model

Original MVP assumption:

- tracked team score prominently
- opponent name if available
- no opponent score in v1

Current product state has moved past that assumption. Opponent score totals are now tracked through dedicated opponent events and recaps can render a true final scoreline when those totals exist.

## User Experience

### Recap Tab in Game Detail

Add a new `Recap` tab to the current game detail page.

New tab order recommendation:

- `Recap`
- `Box Score`
- `Replay`
- `Game Info`

Reason:
Recap becomes the primary post-game share surface and should appear first.

### Recap Layout

The recap tab should render a share-friendly card-like layout with these sections:

#### 1. Header

Show:

- game title
- team name
- opponent name if present
- game date
- status badge like `Final`
- final score when available from the current game summary

#### 2. Top Performers

Show the top 2 or 3 players using existing derived box score totals.

Ranking rule recommendation:

1. sort by `points desc`
2. tie-break by `reb desc`
3. then `ast desc`
4. then name

#### 3. Team Stats

Show a compact team summary row/grid using already-derived totals:

- points
- FG2 percentage
- FG3 percentage
- FT percentage
- rebounds
- assists

#### 4. Key Moments

Show 3 to 5 notable moments from the event log.

Use deterministic rules:

- made 3PT events rank highest
- made 2PT events next
- assists next
- rebounds only if needed as fallback

#### 5. Shot Snapshot

For the free MVP, include a compact, simplified shot snapshot.

#### 6. Share Actions

Include:

- `Copy Link`
- `Share` using `navigator.share` when available
- fallback copy-to-clipboard

## Backend Implementation

### New Summary Function

Add a recap summary builder in the games domain returning:

- recap header data
- top performers
- team summary stats
- key moments
- recap shot snapshot data

### API Changes

Extend the existing game detail responses to include a `recap` field:

- `GET /api/v1/games/:gameId`
- public game detail response

## Frontend Implementation

### New UI Components

Add:

- `GameRecapPanel`
- `RecapShotSnapshot`

### Integration

Modify the existing game detail page to:

- read `data.recap`
- add `Recap` tab
- render `GameRecapPanel`

## Testing

### Backend

Add recap builder tests for:

- score
- top performers
- team stats
- key moments
- shot snapshot

### Frontend

Add tests for:

- recap tab rendering
- share/copy actions
- recap sections

## Future Phases

### Phase 1

- recap tab
- recap payload
- share actions
- shot snapshot

### Phase 2

- downloadable image export
- richer branded recap visuals
- player recap cards

### Phase 3

- season recap collections
- premium recap templates
