import { render } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { FeedList } from './FeedList';

const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

// useIsMobileDevice branches on a pointer-capability query, not a width, so the
// desktop grid is only reachable by stubbing matchMedia.
function stubPointerDevice(isTouch) {
  const original = window.matchMedia;
  window.matchMedia = vi.fn((query) => ({
    matches: query === TOUCH_QUERY ? isTouch : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  return () => {
    window.matchMedia = original;
  };
}

function buildVideoPost(id) {
  return {
    id,
    type: 'video',
    caption: null,
    createdAt: '2026-03-10T00:00:00.000Z',
    creator: { id: 'user-1', name: 'Alex' },
    canDelete: false,
    video: { url: `https://example.com/${id}.mp4`, thumbnailUrl: null },
  };
}

const posts = ['post-1', 'post-2', 'post-3', 'post-4'].map(buildVideoPost);

function renderList() {
  return render(<FeedList posts={posts} onDelete={() => {}} onNearEnd={() => {}} />);
}

describe('FeedList desktop layout', () => {
  let restoreMatchMedia = () => {};

  afterEach(() => {
    restoreMatchMedia();
    restoreMatchMedia = () => {};
  });

  test('lays posts out three per row on desktop', () => {
    restoreMatchMedia = stubPointerDevice(false);

    const { getByTestId } = renderList();

    expect(getByTestId('feed-desktop-grid')).toHaveClass(
      'grid',
      'grid-cols-1',
      'md:grid-cols-2',
      'lg:grid-cols-3'
    );
  });

  test('places each post directly in the grid so cards form the columns', () => {
    restoreMatchMedia = stubPointerDevice(false);

    const { getByTestId } = renderList();
    const cells = Array.from(getByTestId('feed-desktop-grid').children);

    // Posts must be grid children, not nested in a wrapper — a wrapper would
    // collapse the row back to a single column.
    expect(cells.filter((cell) => cell.tagName === 'ARTICLE')).toHaveLength(posts.length);
  });

  test('keeps the load-more sentinel on its own full-width row', () => {
    restoreMatchMedia = stubPointerDevice(false);

    const { getByTestId } = renderList();

    // Without col-span-full the sentinel becomes an ordinary cell and steals a
    // column from the last row of posts.
    expect(getByTestId('feed-load-more-sentinel')).toHaveClass('col-span-full');
  });

  test('still renders the snap-scroll reel on touch devices', () => {
    restoreMatchMedia = stubPointerDevice(true);

    const { container, queryByTestId } = renderList();

    expect(container.querySelectorAll('[data-feed-slide]')).toHaveLength(posts.length);
    expect(queryByTestId('feed-desktop-grid')).not.toBeInTheDocument();
  });
});
