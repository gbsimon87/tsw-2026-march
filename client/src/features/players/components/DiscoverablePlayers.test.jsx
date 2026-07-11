import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { DiscoverablePlayers } from './DiscoverablePlayers';
import { feedApi } from '../../feed/api/feedApi';

vi.mock('../../feed/api/feedApi', () => ({
  feedApi: { listDiscoverablePlayers: vi.fn() },
}));

// FollowButton (rendered per claimed result) reads useAuth; default to a
// logged-out viewer so it renders its "Log in to follow" CTA without needing a
// real AuthProvider. These tests only assert link routing.
vi.mock('../../../app/store/AuthContext', () => ({
  useAuth: () => ({ user: null }),
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
