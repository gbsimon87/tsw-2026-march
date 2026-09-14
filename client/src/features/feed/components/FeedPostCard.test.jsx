import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

// html2canvas cannot rasterise in jsdom, so the image pipeline is stubbed the
// way ShareImageButton's own suite stubs it.
const createImageFile = vi.fn(async () => new File(['png'], 'card.png', { type: 'image/png' }));
vi.mock('../hooks/useShareImage', () => ({
  useShareImage: () => ({ createImageFile, shareImage: vi.fn(), status: 'idle' }),
}));

import { FeedPostCard } from './FeedPostCard';
import { milestoneCardFixture } from './posts/cardFixtures';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function milestonePost(overrides = {}) {
  return {
    id: 'post-1',
    type: 'milestone',
    caption: null,
    createdAt: '2026-03-12T20:00:00.000Z',
    creator: { id: 'user-1', name: 'Alex' },
    canDelete: false,
    milestoneCard: milestoneCardFixture,
    ...overrides,
  };
}

function renderPost(post, props = {}) {
  return render(
    <MemoryRouter>
      <FeedPostCard post={post} onDelete={() => {}} {...props} />
    </MemoryRouter>
  );
}

// Social backlog rank 3: milestone posts rendered in The Pulse but carried no
// way to get the card out of it.
describe('FeedPostCard — milestone', () => {
  it('offers a share-as-image control on a milestone post', () => {
    renderPost(milestonePost());

    expect(screen.getByRole('button', { name: /share as image/i })).toBeInTheDocument();
  });

  it('offers the Instagram hand-off to an operator', () => {
    renderPost(milestonePost(), { onPrepareInstagram: vi.fn() });

    expect(screen.getByRole('button', { name: /prepare for instagram/i })).toBeInTheDocument();
  });

  it('hands over a draft attributed to the milestone, not a game card', async () => {
    const onPrepareInstagram = vi.fn();
    renderPost(milestonePost(), { onPrepareInstagram });

    fireEvent.click(screen.getByRole('button', { name: /prepare for instagram/i }));

    // The draft is built from post.milestoneCard; a game-card-shaped draft would
    // label this "Team vs Opponent" and attribute nothing.
    await vi.waitFor(() => expect(onPrepareInstagram).toHaveBeenCalled());
    expect(onPrepareInstagram.mock.calls[0][0].sourceLabel).toBe(
      'Jordan Miles · 1,000 career points'
    );
  });

  it('still renders the milestone itself', () => {
    renderPost(milestonePost());

    // Two matches: the Pulse card, plus the off-screen export node the share
    // button keeps mounted for html2canvas.
    expect(screen.getAllByText('1,000 career points').length).toBeGreaterThan(0);
  });

  it('shows the caption above the card when the post has one', () => {
    renderPost(milestonePost({ caption: 'Huge night.' }));

    expect(screen.getByText('Huge night.')).toBeInTheDocument();
  });
});
