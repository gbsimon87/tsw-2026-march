import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { InstagramSocialPostPanel } from './InstagramSocialPostPanel';

const feedMocks = vi.hoisted(() => ({ listFeed: vi.fn() }));
const instagramMocks = vi.hoisted(() => ({
  approvePost: vi.fn(),
  cancelPost: vi.fn(),
  createPost: vi.fn(),
  listPosts: vi.fn(),
  markPostReady: vi.fn(),
  queuePost: vi.fn(),
}));

vi.mock('../../feed/api/feedApi', () => ({ feedApi: feedMocks }));
vi.mock('../api/instagramApi', () => ({ instagramApi: instagramMocks }));
vi.mock('../../feed/components/posts/GameCardPost', () => ({
  GameCardPost: () => <div>Game card preview</div>,
}));

const candidate = {
  id: '507f1f77bcf86cd799439011',
  type: 'game_card',
  gameCard: {
    teamName: 'Demo Lions',
    opponent: 'Demo Bears',
  },
};

function socialPost(overrides = {}) {
  return {
    id: '507f1f77bcf86cd799439099',
    status: 'draft',
    caption: 'Demo final score.',
    attributionUrl: null,
    contentDeclaration: 'demo',
    asset: {
      url: 'https://res.cloudinary.com/tsw/image/upload/demo.png',
      width: 2160,
      height: 2700,
    },
    createdAt: '2026-09-04T12:00:00.000Z',
    ...overrides,
  };
}

describe('InstagramSocialPostPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    feedMocks.listFeed.mockResolvedValue({ posts: [candidate] });
    instagramMocks.listPosts.mockResolvedValue({ posts: [] });
  });

  afterEach(() => cleanup());

  test('creates a demo game-card review draft with the exact uploaded image', async () => {
    instagramMocks.createPost.mockResolvedValue({ post: socialPost() });
    render(<InstagramSocialPostPanel />);

    expect(await screen.findByText('Game card preview')).toBeInTheDocument();
    const image = new File(['image'], 'game-card.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Exported 4:5 image'), {
      target: { files: [image] },
    });
    fireEvent.change(screen.getByLabelText(/Instagram caption/), {
      target: { value: 'Demo final score.' },
    });
    fireEvent.click(screen.getByLabelText(/This image contains labelled demo content/i));
    fireEvent.click(screen.getByLabelText(/TSW has the right to publish/i));
    fireEvent.submit(screen.getByRole('button', { name: 'Create review draft' }).closest('form'));

    await waitFor(() => expect(instagramMocks.createPost).toHaveBeenCalledOnce());
    const formData = instagramMocks.createPost.mock.calls[0][0];
    expect(formData.get('sourcePostId')).toBe(candidate.id);
    expect(formData.get('caption')).toBe('Demo final score.');
    expect(formData.get('contentDeclaration')).toBe('demo');
    expect(formData.get('rightsConfirmed')).toBe('true');
    expect(formData.get('file')).toBe(image);
    expect(await screen.findByText('Draft')).toBeInTheDocument();
  });

  test('requires confirmation before approving the exact image and caption', async () => {
    instagramMocks.listPosts.mockResolvedValue({
      posts: [socialPost({ status: 'ready_for_review' })],
    });
    instagramMocks.approvePost.mockResolvedValue({
      post: socialPost({ status: 'approved' }),
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<InstagramSocialPostPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Approve exact image and caption' }));
    await waitFor(() =>
      expect(instagramMocks.approvePost).toHaveBeenCalledWith('507f1f77bcf86cd799439099')
    );
    expect(await screen.findByText('Approved')).toBeInTheDocument();
  });

  test('queues an approved post only after explicit delivery confirmation', async () => {
    instagramMocks.listPosts.mockResolvedValue({
      posts: [socialPost({ status: 'approved' })],
    });
    instagramMocks.queuePost.mockResolvedValue({
      post: socialPost({ status: 'queued' }),
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<InstagramSocialPostPanel publishingEnabled />);

    fireEvent.click(await screen.findByRole('button', { name: 'Queue guarded test publish' }));

    await waitFor(() =>
      expect(instagramMocks.queuePost).toHaveBeenCalledWith('507f1f77bcf86cd799439099')
    );
    expect(await screen.findByText('Queued')).toBeInTheDocument();
  });
});
