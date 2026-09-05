import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { InstagramSocialPostPanel } from './InstagramSocialPostPanel';
import {
  buildInstagramDraft,
  setPendingInstagramDraft,
  takePendingInstagramDraft,
} from '../instagramDraftHandoff';

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
    takePendingInstagramDraft();
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

  describe('hand-off from The Pulse', () => {
    const preparedFile = new File(['png'], 'demo-lions-tsw.png', { type: 'image/png' });

    test('prefills the image, source and caption, and submits without a manual upload', async () => {
      instagramMocks.createPost.mockResolvedValue({ post: socialPost() });
      setPendingInstagramDraft(
        buildInstagramDraft({ ...candidate, caption: 'Demo final score.' }, preparedFile)
      );

      render(<InstagramSocialPostPanel />);

      expect(await screen.findByText(/exact game card you shared from The Pulse/i)).toBeVisible();
      expect(screen.getByText('demo-lions-tsw.png')).toBeInTheDocument();
      expect(screen.getByLabelText(/Instagram caption/)).toHaveValue('Demo final score.');

      // The declarations are still the operator's to make: nothing is prefilled
      // here, and the draft cannot be created until both are ticked.
      expect(screen.getByLabelText(/This image contains labelled demo content/i)).not.toBeChecked();
      expect(screen.getByLabelText(/TSW has the right to publish/i)).not.toBeChecked();

      fireEvent.click(screen.getByLabelText(/This image contains labelled demo content/i));
      fireEvent.click(screen.getByLabelText(/TSW has the right to publish/i));
      fireEvent.submit(screen.getByRole('button', { name: 'Create review draft' }).closest('form'));

      await waitFor(() => expect(instagramMocks.createPost).toHaveBeenCalledOnce());
      const formData = instagramMocks.createPost.mock.calls[0][0];
      expect(formData.get('file')).toBe(preparedFile);
      expect(formData.get('sourcePostId')).toBe(candidate.id);
      expect(formData.get('caption')).toBe('Demo final score.');
    });

    test('does not mark the file input required once an image is already attached', async () => {
      setPendingInstagramDraft(buildInstagramDraft(candidate, preparedFile));
      render(<InstagramSocialPostPanel />);

      // Left required, the browser blocks submit on a form whose image lives in
      // state rather than in the input's own FileList.
      await waitFor(() => expect(screen.getByLabelText(/Exported 4:5 image/)).not.toBeRequired());
    });

    test('offers the shared card as a source even when it is not in the recent feed', async () => {
      feedMocks.listFeed.mockResolvedValue({ posts: [] });
      setPendingInstagramDraft(buildInstagramDraft(candidate, preparedFile));

      render(<InstagramSocialPostPanel />);

      const select = await screen.findByLabelText(/Source game card/);
      expect(select).toHaveValue(candidate.id);
      expect(screen.getByRole('option', { name: 'Demo Lions vs Demo Bears' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create review draft' })).toBeEnabled();
    });

    test('starts from an empty form when no card was shared', async () => {
      render(<InstagramSocialPostPanel />);

      expect(await screen.findByText('Game card preview')).toBeInTheDocument();
      expect(screen.queryByText(/exact game card you shared from The Pulse/i)).toBeNull();
      expect(screen.getByLabelText(/Exported 4:5 image/)).toBeRequired();
      expect(screen.getByRole('button', { name: 'Create review draft' })).toBeDisabled();
    });
  });
});
