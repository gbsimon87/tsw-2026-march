import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { DiscoverablePlayers } from './DiscoverablePlayers';
import { feedApi } from '../../feed/api/feedApi';
import { followsApi } from '../../follows/api/followsApi';
import { useAuth } from '../../../app/store/AuthContext';

vi.mock('../../feed/api/feedApi', () => ({
  feedApi: { listDiscoverablePlayers: vi.fn() },
}));

vi.mock('../../follows/api/followsApi', () => ({
  followsApi: { getStatuses: vi.fn(), follow: vi.fn(), unfollow: vi.fn() },
}));

// FollowButton (rendered per claimed result) reads useAuth; default to a
// logged-out viewer so it renders its "Log in to follow" CTA without needing a
// real AuthProvider. These tests only assert link routing.
vi.mock('../../../app/store/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));

function renderWithProviders(ui) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DiscoverablePlayers link routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test('a claimed result still links its main card to its own per-context profileHref', async () => {
    feedApi.listDiscoverablePlayers.mockResolvedValue({
      players: [
        {
          source: 'league',
          id: 'lp-1',
          displayName: 'Jamie Rivera',
          jerseyNumber: 7,
          claimedByUserId: 'user-1',
          profileHref: '/league/city-league/teams/hawks/players/lp-1',
          team: { name: 'Hawks' },
          league: { name: 'City League' },
        },
      ],
    });

    renderWithProviders(<DiscoverablePlayers />);

    const link = await waitFor(() => screen.getByText('Jamie Rivera').closest('a'));
    expect(link).toHaveAttribute('href', '/league/city-league/teams/hawks/players/lp-1');
  });

  test('a claimed result also shows a secondary link to the unified public profile', async () => {
    feedApi.listDiscoverablePlayers.mockResolvedValue({
      players: [
        {
          source: 'league',
          id: 'lp-1',
          displayName: 'Jamie Rivera',
          jerseyNumber: 7,
          claimedByUserId: 'user-1',
          profileHref: '/league/city-league/teams/hawks/players/lp-1',
          team: { name: 'Hawks' },
          league: { name: 'City League' },
        },
      ],
    });

    renderWithProviders(<DiscoverablePlayers />);

    const unifiedLink = await waitFor(() => screen.getByText(/view full profile/i));
    expect(unifiedLink.closest('a')).toHaveAttribute('href', '/players/user-1');
  });

  test('an unclaimed result links to its per-context profileHref and shows no unified link', async () => {
    feedApi.listDiscoverablePlayers.mockResolvedValue({
      players: [
        {
          source: 'standalone',
          id: 'p-1',
          displayName: 'Alex Chen',
          jerseyNumber: 9,
          claimedByUserId: null,
          profileHref: '/teams/team-1/players/p-1',
          team: { name: 'Hawks' },
          league: null,
        },
      ],
    });

    renderWithProviders(<DiscoverablePlayers />);

    const link = await waitFor(() => screen.getByText('Alex Chen').closest('a'));
    expect(link).toHaveAttribute('href', '/teams/team-1/players/p-1');
    expect(screen.queryByText(/view full profile/i)).not.toBeInTheDocument();
  });
});

describe('DiscoverablePlayers follow-status batching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 'viewer-1' } });
  });

  afterEach(() => {
    cleanup();
  });

  test('fetches follow status once for every claimed result instead of once per card', async () => {
    feedApi.listDiscoverablePlayers.mockResolvedValue({
      players: [
        {
          source: 'league',
          id: 'lp-1',
          displayName: 'Jamie Rivera',
          claimedByUserId: 'user-1',
          profileHref: '/league/city-league/teams/hawks/players/lp-1',
          team: { name: 'Hawks' },
          league: { name: 'City League' },
        },
        {
          source: 'league',
          id: 'lp-2',
          displayName: 'Blake Chen',
          claimedByUserId: 'user-2',
          profileHref: '/league/city-league/teams/hawks/players/lp-2',
          team: { name: 'Hawks' },
          league: { name: 'City League' },
        },
      ],
    });
    followsApi.getStatuses.mockResolvedValue({
      statuses: { 'user-1': true, 'user-2': false },
    });

    renderWithProviders(<DiscoverablePlayers />);

    await waitFor(() => expect(screen.getByText('Jamie Rivera')).toBeInTheDocument());
    await waitFor(() => expect(followsApi.getStatuses).toHaveBeenCalledTimes(1));
    expect(followsApi.getStatuses).toHaveBeenCalledWith(['user-1', 'user-2']);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Unfollow this player' })).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Follow this player' })).toBeInTheDocument();
  });
});
