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

  test('a user can follow their own league/team (no self-follow hiding for non-user types)', async () => {
    useAuth.mockReturnValue({ user: { id: 'me-1' } });
    followsApi.getStatuses.mockResolvedValue({ statuses: {} });

    renderButton({ targetType: 'league', targetId: 'me-1' });

    // targetId matching the user id must NOT hide the button for a league.
    expect(await screen.findByRole('button', { name: /^follow$/i })).toBeInTheDocument();
  });

  test('signed-in viewer can follow a user; the button flips to Following', async () => {
    useAuth.mockReturnValue({ user: { id: 'me-1' } });
    followsApi.getStatuses.mockResolvedValue({ statuses: { 'target-1': false } });
    followsApi.follow.mockResolvedValue({
      follow: { targetType: 'user', targetId: 'target-1', isFollowing: true },
    });

    renderButton({ targetUserId: 'target-1' });

    const button = await screen.findByRole('button', { name: /^follow$/i });
    expect(button).toHaveTextContent('Follow');

    fireEvent.click(button);

    await waitFor(() => expect(followsApi.follow).toHaveBeenCalledWith('user', 'target-1'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /unfollow/i })).toHaveTextContent('Following')
    );
  });

  test.each([
    ['league', 'league-1'],
    ['leagueTeam', 'team-1'],
  ])('signed-in viewer can follow a %s target', async (targetType, targetId) => {
    useAuth.mockReturnValue({ user: { id: 'me-1' } });
    followsApi.getStatuses.mockResolvedValue({ statuses: { [targetId]: false } });
    followsApi.follow.mockResolvedValue({
      follow: { targetType, targetId, isFollowing: true },
    });

    renderButton({ targetType, targetId });

    const button = await screen.findByRole('button', { name: /^follow$/i });
    fireEvent.click(button);

    await waitFor(() => expect(followsApi.follow).toHaveBeenCalledWith(targetType, targetId));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /unfollow/i })).toHaveTextContent('Following')
    );
  });

  test('already-following viewer can unfollow', async () => {
    useAuth.mockReturnValue({ user: { id: 'me-1' } });
    followsApi.getStatuses.mockResolvedValue({ statuses: { 'target-1': true } });
    followsApi.unfollow.mockResolvedValue({
      targetType: 'user',
      targetId: 'target-1',
      isFollowing: false,
    });

    renderButton({ targetUserId: 'target-1' });

    const button = await screen.findByRole('button', { name: /unfollow/i });
    fireEvent.click(button);

    await waitFor(() => expect(followsApi.unfollow).toHaveBeenCalledWith('user', 'target-1'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^follow$/i })).toBeInTheDocument()
    );
  });

  test('knownIsFollowing skips the status fetch entirely', async () => {
    useAuth.mockReturnValue({ user: { id: 'me-1' } });

    renderButton({ targetType: 'league', targetId: 'league-1', knownIsFollowing: true });

    expect(await screen.findByRole('button', { name: /unfollow/i })).toHaveTextContent('Following');
    expect(followsApi.getStatuses).not.toHaveBeenCalled();
  });

  test('surfaces an error message when the toggle fails', async () => {
    useAuth.mockReturnValue({ user: { id: 'me-1' } });
    followsApi.getStatuses.mockResolvedValue({ statuses: { 'target-1': false } });
    followsApi.follow.mockRejectedValue(new Error('Network down'));

    renderButton({ targetUserId: 'target-1' });

    const button = await screen.findByRole('button', { name: /^follow$/i });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network down'));
  });
});
