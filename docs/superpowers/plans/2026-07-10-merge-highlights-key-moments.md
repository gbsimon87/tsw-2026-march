# Merge Highlights and Key Moments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the "Highlights" (video clips) and "Key Moments" (text cards) sections in `GameRecapPanel.jsx` into a single "Highlights" section that shows video clips when available, falls back to text key-moment cards when there's no video, and shows one empty state when neither exists.

**Architecture:** Pure client-side rendering change in one file (`GameRecapPanel.jsx`). No server changes, no prop signature changes. The existing `highlights` and `recap.keyMoments` props already carry everything needed — only the JSX that decides what to render is restructured into one `<section>` with three mutually exclusive branches (video / text fallback / empty).

**Tech Stack:** React 18, Vitest + React Testing Library (client tests).

## Global Constraints

- No changes to server code (`games.service.js`, `gameRecap.service.js`) — `buildGameHighlights` and `buildKeyMoments` stay exactly as they are.
- No changes to `GameDetailPage.jsx` — it already passes both `highlights` and `recap` (which contains `keyMoments`) to `GameRecapPanel`.
- Video branch keeps its existing behavior unchanged: `GameHighlightClip` cards, `HIGHLIGHT_PRIORITY` sort via `selectHighlights`, `MAX_HIGHLIGHTS` cap, Share-to-Pulse button.
- Text-fallback branch reuses the existing Key Moments card markup as-is (avatar placeholder, `formatMomentTime`, `playerName • statLabel`), with **no** Share-to-Pulse button.
- Exactly one of the three branches (video / text fallback / empty message) renders at a time, under a single "Highlights" heading.
- Empty-state copy: "No highlights were available for this game."

---

### Task 1: Merge the two sections in `GameRecapPanel.jsx`

**Files:**

- Modify: `client/src/features/games/components/GameRecapPanel.jsx:129-223` (the existing "Highlights" `<section>` at lines 129-179 and the "Key Moments" `<section>` at lines 181-223)
- Test: `client/src/features/games/components/GameRecapPanel.test.jsx` (new file)

**Interfaces:**

- Consumes: existing `GameRecapPanel` props — `highlights = []`, `recap` (with `recap.keyMoments`), `participants`, `isDualTeam`, `sharedEventIds`, `canShareHighlights`, `clipShareState`, `onShareHighlightClip`. No new props.
- Produces: no new exports. `GameRecapPanel` remains the sole export of this file with the same signature.

- [ ] **Step 1: Write the failing tests**

Create `client/src/features/games/components/GameRecapPanel.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { GameRecapPanel } from './GameRecapPanel';

const baseProps = {
  team: { id: 'team-1', name: 'TSW Team' },
  participants: {},
  isDualTeam: false,
  recap: { keyMoments: [] },
};

describe('GameRecapPanel highlights section', () => {
  test('renders video highlight clips when highlights exist, not the text fallback', () => {
    render(
      <GameRecapPanel
        {...baseProps}
        highlights={[
          {
            eventId: 'e1',
            playerId: 'p1',
            playerName: 'Alex',
            statType: 'FG3_MADE',
            videoTimestamp: 30,
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          },
        ]}
        recap={{
          keyMoments: [
            {
              eventId: 'e1',
              playerId: 'p1',
              playerName: 'Alex',
              statType: 'FG3_MADE',
              statLabel: '3PT Make',
              occurredAt: '2026-03-12T18:03:00.000Z',
            },
          ],
        }}
      />
    );

    expect(screen.getByRole('heading', { name: 'Highlights' })).toBeInTheDocument();
    expect(screen.getByTitle('Alex — 3PT Make')).toBeInTheDocument();
    expect(screen.queryByText('Alex • 3PT Make')).not.toBeInTheDocument();
    expect(
      screen.queryByText('No highlights were available for this game.')
    ).not.toBeInTheDocument();
  });

  test('renders key moments as text cards when there are no video highlights', () => {
    render(
      <GameRecapPanel
        {...baseProps}
        highlights={[]}
        recap={{
          keyMoments: [
            {
              eventId: 'e1',
              playerId: 'p1',
              playerName: 'Alex',
              statType: 'FG3_MADE',
              statLabel: '3PT Make',
              occurredAt: '2026-03-12T18:03:00.000Z',
            },
          ],
        }}
      />
    );

    expect(screen.getByRole('heading', { name: 'Highlights' })).toBeInTheDocument();
    expect(screen.getByText('Alex • 3PT Make')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Share to Pulse/i })).not.toBeInTheDocument();
    expect(
      screen.queryByText('No highlights were available for this game.')
    ).not.toBeInTheDocument();
  });

  test('renders the empty state when there are no highlights and no key moments', () => {
    render(<GameRecapPanel {...baseProps} highlights={[]} recap={{ keyMoments: [] }} />);

    expect(screen.getByRole('heading', { name: 'Highlights' })).toBeInTheDocument();
    expect(screen.getByText('No highlights were available for this game.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter client test -- GameRecapPanel`
Expected: FAIL — no `GameRecapPanel.test.jsx` behavior matches yet (currently two separate sections named "Highlights" and "Key Moments" both render, so the "not.toBeInTheDocument()" assertions for the text fallback in the video test, and the heading-count/empty-state assertions, will fail).

- [ ] **Step 3: Replace the two sections with one merged section**

In `client/src/features/games/components/GameRecapPanel.jsx`, replace lines 129-223 (the `{highlights.length > 0 ? (...) : null}` Highlights section immediately followed by the Key Moments `<section>`) with:

```jsx
<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
  <h3 className="mb-3 text-xl font-semibold text-slate-900">Highlights</h3>
  {highlights.length > 0 ? (
    <HorizontalScrollRow>
      {selectHighlights(highlights).map((h) => {
        const clipState =
          clipShareState[h.eventId] || (sharedEventIds?.includes(h.eventId) ? 'shared' : 'idle');
        return (
          <div key={h.eventId} className="flex shrink-0 flex-col">
            <GameHighlightClip
              videoUrl={h.videoUrl}
              timestamp={h.videoTimestamp}
              statType={h.statType}
              playerName={h.playerName}
              teamSide={h.teamSide}
              participantName={
                isDualTeam && h.teamSide ? getParticipantName(participants, h.teamSide) : null
              }
            />
            {canShareHighlights ? (
              <button
                type="button"
                disabled={clipState === 'loading' || clipState === 'shared'}
                onClick={() => onShareHighlightClip?.(h.eventId)}
                aria-label={
                  clipState === 'loading'
                    ? 'Sharing…'
                    : clipState === 'shared'
                      ? 'Shared to Pulse'
                      : clipState !== 'idle'
                        ? clipState
                        : 'Share to Pulse'
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {clipState === 'loading'
                  ? 'Sharing…'
                  : clipState === 'shared'
                    ? '✓ Shared to Pulse'
                    : clipState !== 'idle'
                      ? clipState
                      : 'Share to Pulse'}
              </button>
            ) : null}
          </div>
        );
      })}
    </HorizontalScrollRow>
  ) : (recap?.keyMoments || []).length > 0 ? (
    <HorizontalScrollRow>
      {recap.keyMoments.map((moment) => (
        <div
          key={moment.eventId}
          className="flex w-56 shrink-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"
        >
          <CloudinaryImage
            src={playerPlaceholder}
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            loading="lazy"
            decoding="async"
            className="h-8 w-8 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
          />
          <div className="min-w-0">
            <p
              className="text-xs font-semibold uppercase tracking-wide text-slate-500"
              title="Real-world clock time when this moment was recorded"
            >
              at {formatMomentTime(moment.occurredAt)}
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-slate-900">
              {moment.playerName} • {moment.statLabel}
            </p>
          </div>
        </div>
      ))}
    </HorizontalScrollRow>
  ) : (
    <p className="mt-4 text-sm text-slate-600">No highlights were available for this game.</p>
  )}
</section>
```

Note: the `TSW-002` comment above `HorizontalScrollRow` (lines 35-39) documents why both sections share that component — leave it in place since `HorizontalScrollRow` is still shared by both branches.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter client test -- GameRecapPanel`
Expected: PASS — all three new tests green.

- [ ] **Step 5: Run the full client test suite to catch regressions in `GameDetailPage.test.jsx`**

Run: `pnpm --filter client test -- GameDetailPage`
Expected: PASS. None of the existing fixtures in `GameDetailPage.test.jsx` set `data.highlights`, and all set `recap.keyMoments` to either `[]` or a populated array — no existing assertion references a "Key Moments" heading or count text, so no fixture changes should be required. If any assertion unexpectedly fails, inspect it against the new merged markup and update the assertion to match (e.g., an assertion counting two distinct headings would need updating to expect one).

- [ ] **Step 6: Commit**

```bash
git add client/src/features/games/components/GameRecapPanel.jsx client/src/features/games/components/GameRecapPanel.test.jsx
git commit -m "feat(games): merge highlights and key moments into one section"
```

---

## Post-plan verification

- [ ] Run `pnpm --filter client lint` — expect no new lint errors in `GameRecapPanel.jsx`.
- [ ] Run `pnpm --filter client test` (full client suite) — expect all green.
- [ ] Manually verify in the browser: open a game with `videoUrl` and highlight-eligible events → see video clips under "Highlights", no "Key Moments" heading anywhere. Open a game with no `videoUrl` but events matching `MOMENT_PRIORITY` → see text cards under "Highlights". Open a game with neither → see "No highlights were available for this game."
