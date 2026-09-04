import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MySportyPage } from './MySportyPage';
import { leaguesApi } from '../api/leaguesApi';
import { teamsApi } from '../../teams/api/teamsApi';

vi.mock('../api/leaguesApi', () => ({
  leaguesApi: { getMyProfiles: vi.fn() },
}));

vi.mock('../../teams/api/teamsApi', () => ({
  teamsApi: { getMyPlayerProfiles: vi.fn() },
}));

vi.mock('../../../app/store/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Jamie Rivera' },
    updateUser: vi.fn(),
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MySportyPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('MySportyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaguesApi.getMyProfiles.mockResolvedValue({ profiles: [] });
    teamsApi.getMyPlayerProfiles.mockResolvedValue({ profiles: [] });
  });

  test('links users to Discover players to find and request their profile', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: 'Find my profile' });
    expect(link).toHaveAttribute('href', '/home?tab=players');
    expect(screen.getByText(/request to link it to your account/i)).toBeInTheDocument();
  });

  test('shows approved profiles from managed teams', async () => {
    teamsApi.getMyPlayerProfiles.mockResolvedValue({
      profiles: [
        {
          id: 'standalone:team-1:player-1',
          displayName: 'Jamie Rivera',
          memberRoleLabel: 'managed team',
          profileHref: '/teams/team-1/players/player-1',
          team: { id: 'team-1', name: 'Sunday Ballers', logo: null },
          summary: { gamesCount: 2, pointsPerGame: 8, reboundsPerGame: 4, assistsPerGame: 3 },
        },
      ],
    });

    renderPage();

    expect(await screen.findByText('Sunday Ballers')).toBeInTheDocument();
    expect(screen.getByText('managed team')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Jamie Rivera/i })).toHaveAttribute(
      'href',
      '/teams/team-1/players/player-1'
    );
  });
});
