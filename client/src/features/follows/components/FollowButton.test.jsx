import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FollowButton } from './FollowButton';
import { followsApi } from '../api/followsApi';
import { useAuth } from '../../../app/store/AuthContext';

vi.mock('../api/followsApi', () => ({
  followsApi: {
    follow: vi.fn(),
    unfollow: vi.fn(),
    getStatuses: vi.fn(),
  },
}));

vi.mock('../../../app/store/AuthContext', () => ({
  useAuth: vi.fn(),
}));

function renderButton(props) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FollowButton {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('FollowButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    followsApi.getStatuses.mockResolvedValue({ statuses: {} });
  });

  afterEach(() => {
    cleanup();
  });

  test('logged-out viewer sees a "Log in to follow" link', () => {
    useAuth.mockReturnValue({ user: null });

    renderButton({ targetUserId: 'target-1' });

    const cta = screen.getByText(/log in to follow/i);
    expect(cta.closest('a')).toHaveAttribute('href', '/login');
    expect(followsApi.getStatuses).not.toHaveBeenCalled();
  });

  test('renders nothing when viewing your own account', () => {
    useAuth.mockReturnValue({ user: { id: 'me-1' } });

    const { container } = renderButton({ targetUserId: 'me-1' });

    expect(container).toBeEmptyDOMElement();
  });

  test('signed-in viewer can follow and the button flips to Following', async () => {
    useAuth.mockReturnValue({ user: { id: 'me-1' } });
    followsApi.getStatuses.mockResolvedValue({ statuses: { 'target-1': false } });
    followsApi.follow.mockResolvedValue({
      follow: { targetUserId: 'target-1', isFollowing: true },
    });

    renderButton({ targetUserId: 'target-1' });

    const button = await screen.findByRole('button', { name: /follow this player/i });
    expect(button).toHaveTextContent('Follow');

    fireEvent.click(button);

    await waitFor(() => expect(followsApi.follow).toHaveBeenCalledWith('target-1'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /unfollow this player/i })).toHaveTextContent(
        'Following'
      )
    );
  });

  test('already-following viewer can unfollow', async () => {
    useAuth.mockReturnValue({ user: { id: 'me-1' } });
    followsApi.getStatuses.mockResolvedValue({ statuses: { 'target-1': true } });
    followsApi.unfollow.mockResolvedValue({ targetUserId: 'target-1', isFollowing: false });

    renderButton({ targetUserId: 'target-1' });

    const button = await screen.findByRole('button', { name: /unfollow this player/i });
    fireEvent.click(button);

    await waitFor(() => expect(followsApi.unfollow).toHaveBeenCalledWith('target-1'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /follow this player/i })).toBeInTheDocument()
    );
  });

  test('surfaces an error message when the toggle fails', async () => {
    useAuth.mockReturnValue({ user: { id: 'me-1' } });
    followsApi.getStatuses.mockResolvedValue({ statuses: { 'target-1': false } });
    followsApi.follow.mockRejectedValue(new Error('Network down'));

    renderButton({ targetUserId: 'target-1' });

    const button = await screen.findByRole('button', { name: /follow this player/i });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network down'));
  });
});
