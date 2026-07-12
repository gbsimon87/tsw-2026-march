# Shareable Graphics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let fans export any existing game/player/team card as a crisp, TSW-branded PNG and share it via the native OS share sheet (download fallback on desktop).

**Architecture:** Purely client-side. A portable `ShareImageButton` renders the card into a hidden, fixed-size (1080×1350) `ShareableCardExport` layout, which a `useShareImage` hook captures to a PNG with `html2canvas`, then dispatches via `navigator.share({ files })` or a download. No server changes, no new endpoints, no schema.

**Tech Stack:** React 18 + Vite, Tailwind (inline), `html2canvas`, Vitest + React Testing Library. Named exports everywhere. No path aliases (relative imports).

## Global Constraints

- Client tests use **Vitest + React Testing Library** only (`pnpm --filter client test`). Never Jest on the client.
- **Named exports** everywhere. No default-export components (except where existing files already do — match the file you touch).
- Tailwind utility classes inline; no new CSS files.
- Relative imports only — **no path aliases**.
- Conventional commits (commitlint + Husky enforced on commit).
- Reuse the existing `GameCardPost` / `PlayerCardPost` / `TeamCardPost` and `ShareCardPrimitives` — **no visual redesign** of the cards themselves.
- Card components accept `interactive={false}` to disable internal `Link`s — the export layout MUST pass this so captured cards contain no anchors.

---

## File Structure

- Create `client/src/features/feed/hooks/useShareImage.js` — the capture+share engine (no domain knowledge).
- Create `client/src/features/feed/hooks/useShareImage.test.js` — hook tests.
- Create `client/src/features/feed/components/cards/ShareableCardExport.jsx` — off-screen 1080×1350 branded render target.
- Create `client/src/features/feed/components/cards/ShareableCardExport.test.jsx` — snapshot tests per card type.
- Create `client/src/features/feed/components/ShareImageButton.jsx` — portable trigger composing the two above.
- Create `client/src/features/feed/components/ShareImageButton.test.jsx` — button tests.
- Modify `client/src/features/feed/components/FeedPostCard.jsx` — add the button to game/player/team posts.
- Modify `client/src/features/teams/pages/PublicPlayerPage.jsx` — add the button next to the player card.
- Modify `client/src/features/teams/pages/PublicTeamPage.jsx` — add the button next to the team card.
- Modify `client/src/features/games/pages/GameDetailPage.jsx` — add the button next to the game card (confirm the card render site first).

---

## Task 1: Add `html2canvas` dependency

**Files:**

- Modify: `client/package.json`

- [ ] **Step 1: Install**

Run:

```bash
pnpm --filter client add html2canvas
```

- [ ] **Step 2: Verify it resolves**

Run:

```bash
node -e "require.resolve('html2canvas', { paths: ['client/node_modules'] }) && console.log('ok')"
```

Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add client/package.json pnpm-lock.yaml
git commit -m "build(client): add html2canvas for shareable graphics"
```

---

## Task 2: `useShareImage` hook

**Files:**

- Create: `client/src/features/feed/hooks/useShareImage.js`
- Test: `client/src/features/feed/hooks/useShareImage.test.js`

**Interfaces:**

- Consumes: `html2canvas` (default export), browser `navigator.share` / `navigator.canShare`.
- Produces: `useShareImage()` → `{ shareImage, status }`.
  - `shareImage(node: HTMLElement, fileName: string): Promise<void>` — captures `node`, shares or downloads a PNG.
  - `status: 'idle' | 'generating' | 'success' | 'error'`.

- [ ] **Step 1: Write the failing test**

Create `client/src/features/feed/hooks/useShareImage.test.js`:

```js
import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useShareImage } from './useShareImage';

const toBlob = (cb) => cb(new Blob(['x'], { type: 'image/png' }));

vi.mock('html2canvas', () => ({
  default: vi.fn(async () => ({ toBlob })),
}));

import html2canvas from 'html2canvas';

function makeNode() {
  return document.createElement('div');
}

describe('useShareImage', () => {
  beforeEach(() => {
    html2canvas.mockClear();
  });

  afterEach(() => {
    delete navigator.share;
    delete navigator.canShare;
    vi.restoreAllMocks();
  });

  it('shares a PNG file via navigator.share when supported', async () => {
    navigator.canShare = vi.fn(() => true);
    navigator.share = vi.fn(async () => {});

    const { result } = renderHook(() => useShareImage());
    await act(async () => {
      await result.current.shareImage(makeNode(), 'card.png');
    });

    expect(navigator.share).toHaveBeenCalledTimes(1);
    const arg = navigator.share.mock.calls[0][0];
    expect(arg.files[0]).toBeInstanceOf(File);
    expect(arg.files[0].type).toBe('image/png');
    expect(result.current.status).toBe('success');
  });

  it('falls back to download when share is unsupported', async () => {
    const click = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = Object.assign(document.createElementNS('http://www.w3.org/1999/xhtml', tag), {});
      if (tag === 'a') el.click = click;
      return el;
    });
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();

    const { result } = renderHook(() => useShareImage());
    await act(async () => {
      await result.current.shareImage(makeNode(), 'card.png');
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('success');
  });

  it('returns to idle when the user cancels the share (AbortError)', async () => {
    navigator.canShare = vi.fn(() => true);
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    navigator.share = vi.fn(async () => {
      throw abort;
    });

    const { result } = renderHook(() => useShareImage());
    await act(async () => {
      await result.current.shareImage(makeNode(), 'card.png');
    });

    expect(result.current.status).toBe('idle');
  });

  it('sets error status when capture throws', async () => {
    html2canvas.mockRejectedValueOnce(new Error('tainted'));

    const { result } = renderHook(() => useShareImage());
    await act(async () => {
      await result.current.shareImage(makeNode(), 'card.png');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client test useShareImage`
Expected: FAIL — cannot resolve `./useShareImage`.

- [ ] **Step 3: Write minimal implementation**

Create `client/src/features/feed/hooks/useShareImage.js`:

```js
import { useCallback, useState } from 'react';
import html2canvas from 'html2canvas';

// Capture a DOM node to a branded PNG and hand it to the OS share sheet,
// falling back to a download when Web Share (with files) is unavailable.
// Knows nothing about the domain — it shares whatever node it is given.
export function useShareImage() {
  const [status, setStatus] = useState('idle');

  const shareImage = useCallback(async (node, fileName) => {
    if (!node) return;
    setStatus('generating');

    let blob;
    try {
      const canvas = await html2canvas(node, {
        backgroundColor: null,
        useCORS: true,
        scale: 2,
        logging: false,
      });
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Failed to produce image blob');
    } catch (error) {
      setStatus('error');
      return;
    }

    const file = new File([blob], fileName, { type: 'image/png' });

    const canShareFiles =
      typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

    if (canShareFiles && typeof navigator.share === 'function') {
      try {
        await navigator.share({ files: [file] });
        setStatus('success');
      } catch (error) {
        // User dismissed the share sheet — not an error.
        if (error && error.name === 'AbortError') {
          setStatus('idle');
        } else {
          setStatus('error');
        }
      }
      return;
    }

    // Download fallback (desktop / unsupported).
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('success');
  }, []);

  return { shareImage, status };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client test useShareImage`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/features/feed/hooks/useShareImage.js client/src/features/feed/hooks/useShareImage.test.js
git commit -m "feat(feed): add useShareImage hook for PNG capture + share"
```

---

## Task 3: `ShareableCardExport` component

**Files:**

- Create: `client/src/features/feed/components/cards/ShareableCardExport.jsx`
- Test: `client/src/features/feed/components/cards/ShareableCardExport.test.jsx`

**Interfaces:**

- Consumes: `GameCardPost`, `PlayerCardPost`, `TeamCardPost` (named exports from `../posts/...`), each accepting `interactive={false}`.
- Produces: `ShareableCardExport` — `forwardRef` component.
  - Props: `{ type: 'game_card' | 'player_card' | 'team_card', gameCard?, playerCard?, teamCard? }`.
  - The forwarded ref points at the capture node (the 1080×1350 root).

- [ ] **Step 1: Write the failing test**

Create `client/src/features/feed/components/cards/ShareableCardExport.test.jsx`:

```jsx
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ShareableCardExport } from './ShareableCardExport';

const playerCard = {
  playerName: 'Jordan Lee',
  teamName: 'Falcons',
  jerseyNumber: 23,
  playerImage: null,
  teamLogo: null,
  teamColors: [],
  summary: { pointsPerGame: 18.2, reboundsPerGame: 6.1, assistsPerGame: 4.4 },
};

function renderExport(props) {
  return render(
    <MemoryRouter>
      <ShareableCardExport {...props} />
    </MemoryRouter>
  );
}

describe('ShareableCardExport', () => {
  it('renders a player card export with the TSW watermark', () => {
    const { container, getByText } = renderExport({ type: 'player_card', playerCard });
    expect(getByText(/the sporty way/i)).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders nothing for an unknown type', () => {
    const { container } = renderExport({ type: 'nope' });
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client test ShareableCardExport`
Expected: FAIL — cannot resolve `./ShareableCardExport`.

- [ ] **Step 3: Write minimal implementation**

Create `client/src/features/feed/components/cards/ShareableCardExport.jsx`:

```jsx
import { forwardRef } from 'react';

import { GameCardPost } from '../posts/GameCardPost';
import { PlayerCardPost } from '../posts/PlayerCardPost';
import { TeamCardPost } from '../posts/TeamCardPost';

// Off-screen, fixed-size render target captured by html2canvas. Positioned
// off-viewport (NOT display:none) because html2canvas needs a laid-out node.
// Reuses the exact feed cards with interactive={false} so no <a> tags are
// captured, plus a TSW watermark so every share markets the product.
const EXPORT_STYLE = {
  position: 'absolute',
  left: '-99999px',
  top: 0,
  width: '1080px',
  minHeight: '1350px',
  pointerEvents: 'none',
};

function renderCard({ type, gameCard, playerCard, teamCard }) {
  if (type === 'game_card' && gameCard) {
    return <GameCardPost gameCard={gameCard} interactive={false} />;
  }
  if (type === 'player_card' && playerCard) {
    return <PlayerCardPost playerCard={playerCard} interactive={false} />;
  }
  if (type === 'team_card' && teamCard) {
    return <TeamCardPost teamCard={teamCard} interactive={false} />;
  }
  return null;
}

export const ShareableCardExport = forwardRef(function ShareableCardExport(props, ref) {
  const card = renderCard(props);
  if (!card) return null;

  return (
    <div ref={ref} aria-hidden="true" style={EXPORT_STYLE}>
      <div className="flex min-h-[1350px] flex-col justify-between gap-8 bg-slate-950 p-16">
        <div className="flex flex-1 items-center">{card}</div>
        <p className="text-center text-2xl font-bold uppercase tracking-[0.3em] text-slate-400">
          The Sporty Way
        </p>
      </div>
    </div>
  );
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client test ShareableCardExport`
Expected: PASS (2 tests); a snapshot file is written under `__snapshots__/`.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/feed/components/cards/ShareableCardExport.jsx client/src/features/feed/components/cards/ShareableCardExport.test.jsx client/src/features/feed/components/cards/__snapshots__
git commit -m "feat(feed): add off-screen ShareableCardExport render target"
```

---

## Task 4: `ShareImageButton` component

**Files:**

- Create: `client/src/features/feed/components/ShareImageButton.jsx`
- Test: `client/src/features/feed/components/ShareImageButton.test.jsx`

**Interfaces:**

- Consumes: `useShareImage` (Task 2), `ShareableCardExport` (Task 3).
- Produces: `ShareImageButton` component.
  - Props: `{ type, gameCard?, playerCard?, teamCard?, fileName?, className? }`.
  - Renders the hidden export + a button; on click captures the export node and shares/downloads.

- [ ] **Step 1: Write the failing test**

Create `client/src/features/feed/components/ShareImageButton.test.jsx`:

```jsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const shareImage = vi.fn();

vi.mock('./hooks/useShareImage', () => ({
  useShareImage: () => ({ shareImage, status: shareStatus }),
}));

// Stub the export so the test doesn't depend on card internals.
vi.mock('./cards/ShareableCardExport', () => ({
  ShareableCardExport: () => <div data-testid="export" />,
}));

let shareStatus = 'idle';

import { ShareImageButton } from './ShareImageButton';

describe('ShareImageButton', () => {
  it('invokes shareImage on click', () => {
    shareStatus = 'idle';
    render(<ShareImageButton type="player_card" playerCard={{ playerName: 'X' }} />);
    fireEvent.click(screen.getByRole('button', { name: /share as image/i }));
    expect(shareImage).toHaveBeenCalledTimes(1);
  });

  it('is disabled while generating', () => {
    shareStatus = 'generating';
    render(<ShareImageButton type="player_card" playerCard={{ playerName: 'X' }} />);
    expect(screen.getByRole('button', { name: /share as image/i })).toBeDisabled();
  });

  it('shows an error message on error', () => {
    shareStatus = 'error';
    render(<ShareImageButton type="player_card" playerCard={{ playerName: 'X' }} />);
    expect(screen.getByText(/couldn't create image/i)).toBeInTheDocument();
  });
});
```

Note: the mock path is `./hooks/useShareImage` — the hook lives one directory up from this component (`../hooks/`), so **use `../hooks/useShareImage` in both the import and the mock**. Correct the mock path to `../hooks/useShareImage` before running.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter client test ShareImageButton`
Expected: FAIL — cannot resolve `./ShareImageButton`.

- [ ] **Step 3: Write minimal implementation**

Create `client/src/features/feed/components/ShareImageButton.jsx`:

```jsx
import { useRef } from 'react';

import { ShareableCardExport } from './cards/ShareableCardExport';
import { useShareImage } from '../hooks/useShareImage';

function defaultFileName(props) {
  const label =
    props.playerCard?.playerName || props.teamCard?.teamName || props.gameCard?.teamName || 'tsw';
  return `${String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}-tsw.png`;
}

export function ShareImageButton({ className, fileName, ...cardProps }) {
  const exportRef = useRef(null);
  const { shareImage, status } = useShareImage();

  const handleClick = () => {
    shareImage(exportRef.current, fileName || defaultFileName(cardProps));
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'generating'}
        aria-label="Share as image"
        title="Share as image"
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
          <path d="M12 3v13M8 7l4-4 4 4" />
        </svg>
      </button>
      {status === 'error' ? (
        <p className="mt-1 text-xs font-medium text-red-600">Couldn't create image. Try again.</p>
      ) : null}
      <ShareableCardExport ref={exportRef} {...cardProps} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter client test ShareImageButton`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/features/feed/components/ShareImageButton.jsx client/src/features/feed/components/ShareImageButton.test.jsx
git commit -m "feat(feed): add portable ShareImageButton trigger"
```

---

## Task 5: Wire into the Pulse feed

**Files:**

- Modify: `client/src/features/feed/components/FeedPostCard.jsx`

**Interfaces:**

- Consumes: `ShareImageButton` (Task 4). `post.gameCard` / `post.playerCard` / `post.teamCard` are already available.

- [ ] **Step 1: Add the import**

At the top of `client/src/features/feed/components/FeedPostCard.jsx`, add:

```jsx
import { ShareImageButton } from './ShareImageButton';
```

- [ ] **Step 2: Render the button under each card post**

Replace the `game_card` branch's `GameCardPost` render (the truthy `post.gameCard` case, lines ~28-29) with:

```jsx
        {post.gameCard ? (
          <div className="space-y-3">
            <GameCardPost gameCard={post.gameCard} />
            <div className="flex justify-end">
              <ShareImageButton type="game_card" gameCard={post.gameCard} />
            </div>
          </div>
        ) : (
```

In the `player_card` branch, replace `<PlayerCardPost playerCard={post.playerCard} />` (line ~51) with:

```jsx
        <PlayerCardPost playerCard={post.playerCard} />
        <div className="flex justify-end">
          <ShareImageButton type="player_card" playerCard={post.playerCard} />
        </div>
```

In the `team_card` branch, replace `<TeamCardPost teamCard={post.teamCard} />` (line ~58) with:

```jsx
        <TeamCardPost teamCard={post.teamCard} />
        <div className="flex justify-end">
          <ShareImageButton type="team_card" teamCard={post.teamCard} />
        </div>
```

- [ ] **Step 3: Run the existing feed tests to confirm no regressions**

Run: `pnpm --filter client test FeedPostCard CardPosts`
Expected: PASS (existing tests still green; the button is additive).

- [ ] **Step 4: Commit**

```bash
git add client/src/features/feed/components/FeedPostCard.jsx
git commit -m "feat(feed): add share-as-image button to Pulse card posts"
```

---

## Task 6: Wire into game / player / team pages

**Files:**

- Modify: `client/src/features/teams/pages/PublicPlayerPage.jsx`
- Modify: `client/src/features/teams/pages/PublicTeamPage.jsx`
- Modify: `client/src/features/games/pages/GameDetailPage.jsx`

**Interfaces:**

- Consumes: `ShareImageButton` (Task 4). Each page already builds a card snapshot object inline and renders the corresponding `*CardPost`.

- [ ] **Step 1: Player page — import + button**

In `client/src/features/teams/pages/PublicPlayerPage.jsx` add near the other feed imports (line ~9):

```jsx
import { ShareImageButton } from '../../feed/components/ShareImageButton';
```

Immediately after the `<PlayerCardPost ... />` block (ends ~line 351), add:

```jsx
<div className="flex justify-end">
  <ShareImageButton
    type="player_card"
    playerCard={{
      playerUrl: `/teams/${teamId}/players/${playerId}`,
      playerName: playerLabel,
      teamName: data.team.name,
      jerseyNumber: data.player.jerseyNumber ?? null,
      playerImage: data.player.image ?? null,
      teamLogo: data.team.logo ?? null,
      teamColors: data.team.colors ?? [],
      summary: {
        pointsPerGame: summary.pointsPerGame,
        reboundsPerGame: summary.reboundsPerGame,
        assistsPerGame: summary.assistsPerGame,
      },
    }}
  />
</div>
```

- [ ] **Step 2: Team page — import + button**

In `client/src/features/teams/pages/PublicTeamPage.jsx`, add the import:

```jsx
import { ShareImageButton } from '../../feed/components/ShareImageButton';
```

Immediately after `<TeamCardPost teamCard={teamCardPreview} interactive={false} />` (line ~447), add:

```jsx
<div className="flex justify-end">
  <ShareImageButton type="team_card" teamCard={teamCardPreview} />
</div>
```

- [ ] **Step 3: Game page — locate the card render, then add the button**

Open `client/src/features/games/pages/GameDetailPage.jsx` and find where a game-card snapshot object is built for the Pulse composer / recap (search for `GameCardPost`, `gameCard`, or `createGameCardPost`). Add the import:

```jsx
import { ShareImageButton } from '../../feed/components/ShareImageButton';
```

Render, adjacent to the existing "share to Pulse" control, using the same gameCard object already assembled on that page:

```jsx
<div className="flex justify-end">
  <ShareImageButton type="game_card" gameCard={gameCard} />
</div>
```

If the page assembles the gameCard object under a different variable name, use that name verbatim — do not invent a new snapshot. If no gameCard object exists on the page yet, build it from the same fields the Pulse composer uses (`teamName`, `teamLogo`, `teamColors`, `opponent`, `recap`) and note the source in the commit.

- [ ] **Step 4: Run the page tests**

Run: `pnpm --filter client test PublicPlayerPage PublicTeamPage GameDetailPage`
Expected: PASS. If a snapshot test fails only because the new button appears in the tree, update the snapshot (`-u`) after confirming the diff is just the added button.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/teams/pages/PublicPlayerPage.jsx client/src/features/teams/pages/PublicTeamPage.jsx client/src/features/games/pages/GameDetailPage.jsx
git commit -m "feat: add share-as-image button to game/player/team pages"
```

---

## Task 7: Full verification + docs update

**Files:**

- Modify: `docs/shareable-graphics/status-dashboard.md`

- [ ] **Step 1: Lint**

Run: `pnpm --filter client lint`
Expected: no errors.

- [ ] **Step 2: Full client test run**

Run: `pnpm --filter client test`
Expected: all pass.

- [ ] **Step 3: Build**

Run: `pnpm --filter client build`
Expected: build succeeds.

- [ ] **Step 4: Manual smoke check**

Run `pnpm dev`, open the Pulse and a player page. On desktop: click share-as-image → a PNG downloads showing the branded 1080×1350 card. (Native share sheet is verified on a real mobile device / responsive emulation with Web Share support.)

- [ ] **Step 5: Update status dashboard**

Edit `docs/shareable-graphics/status-dashboard.md`: flip the relevant Milestones / Components / Integration rows to 🟢 and update "Last updated" and "Overall".

- [ ] **Step 6: Commit**

```bash
git add docs/shareable-graphics/status-dashboard.md
git commit -m "docs(shareable-graphics): mark feature complete in status dashboard"
```

---

## Self-Review Notes

- **Spec coverage:** engine (Task 2), export layout + watermark + 1080×1350 + interactive=false (Task 3), portable trigger with generating/error states (Task 4), Pulse entry point (Task 5), entity-page entry points (Task 6), all four test suites, dependency (Task 1), docs (Task 7). Error-handling cases (abort/unsupported/tainted/concurrency-via-disabled) covered by Task 2 tests + Task 4 disabled state.
- **CORS:** handled via `useCORS: true` in the hook; missing photos degrade through the cards' existing `imageFallback`, so no extra task needed.
- **Type consistency:** `shareImage(node, fileName)` and `status` values are identical across Tasks 2/4; `ShareableCardExport` prop names (`type`, `gameCard`, `playerCard`, `teamCard`) are identical across Tasks 3/4/5/6.
