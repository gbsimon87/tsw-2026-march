import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FollowingPage } from './FollowingPage';
import { followsApi } from '../api/followsApi';

vi.mock('../api/followsApi', () => ({
  followsApi: {
    listFollowing: vi.fn(),
    getStatuses: vi.fn(),
    follow: vi.fn(),
    unfollow: vi.fn(),
  },
}));

// FollowButton (on each card) reads useAuth; the viewer is signed in here.
vi.mock('../../../app/store/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me-1' } }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FollowingPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('FollowingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    followsApi.getStatuses.mockResolvedValue({ statuses: {} });
  });

  afterEach(() => {
    cleanup();
  });

  test('shows an empty state when following no one', async () => {
    followsApi.listFollowing.mockResolvedValue({ following: [], nextCursor: null });

    renderPage();

    await waitFor(() => expect(screen.getByText(/not following anyone yet/i)).toBeInTheDocument());
  });

  test('renders a card per followed user with a profile link when public', async () => {
    followsApi.listFollowing.mockResolvedValue({
      following: [
        {
          userId: 'target-1',
          name: 'Jamie Rivera',
          avatarUrl: null,
          hasPublicProfile: true,
          profileHref: '/players/target-1',
        },
      ],
      nextCursor: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Jamie Rivera')).toBeInTheDocument());
    const profileLink = screen.getByText(/view profile/i).closest('a');
    expect(profileLink).toHaveAttribute('href', '/players/target-1');
  });

  test('shows a minimal card (no profile link) when the user has no public profile', async () => {
    followsApi.listFollowing.mockResolvedValue({
      following: [
        {
          userId: 'target-2',
          name: 'Alex Chen',
          avatarUrl: null,
          hasPublicProfile: false,
          profileHref: null,
        },
      ],
      nextCursor: null,
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Alex Chen')).toBeInTheDocument());
    expect(screen.getByText(/no public profile yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/view profile/i)).not.toBeInTheDocument();
  });

  test('surfaces a load error', async () => {
    followsApi.listFollowing.mockRejectedValue(new Error('Boom'));

    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Boom'));
  });
});
