import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PublicLeagueStandingsPage } from './PublicLeagueStandingsPage';
import { leaguesApi } from '../api/leaguesApi';
import { usePublicLeague } from '../hooks/usePublicLeague';

vi.mock('../api/leaguesApi', () => ({
  leaguesApi: {
    getPublicStandings: vi.fn(),
  },
}));

vi.mock('../hooks/usePublicLeague', () => ({
  usePublicLeague: vi.fn(),
}));

const league = {
  id: 'league-1',
  name: 'Metro League',
  slug: 'metro-league',
  seasonLabel: 'Spring 2026',
  currentSeason: { id: 'season-1', label: 'Spring 2026' },
  seasons: [{ id: 'season-1', label: 'Spring 2026' }],
  teams: [
    { id: 'team-a', name: 'Falcons', slug: 'falcons' },
    { id: 'team-b', name: 'Bears', slug: 'bears' },
  ],
  games: [
    {
      id: 'game-1',
      status: 'completed',
      completedAt: '2026-03-01T18:00:00.000Z',
      homeLeagueTeamId: 'team-a',
      awayLeagueTeamId: 'team-b',
      homeTeamName: 'Falcons',
      awayTeamName: 'Bears',
      homePoints: 74,
      awayPoints: 68,
    },
  ],
};

const standings = [
  {
    teamId: 'team-a',
    teamName: 'Falcons',
    record: '1-0',
    wins: 1,
    losses: 0,
    pointsFor: 74,
    pointsAgainst: 68,
    pointDiff: 6,
  },
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/league/metro-league/standings']}>
        <Routes>
          <Route path="/league/:leagueSlug/standings" element={<PublicLeagueStandingsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PublicLeagueStandingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePublicLeague.mockReturnValue({ data: league, isLoading: false, isError: false });
    leaguesApi.getPublicStandings.mockResolvedValue({ standings });
  });

  test('shows recent form in the full standings table', async () => {
    renderPage();

    expect(await screen.findByRole('columnheader', { name: 'Form' })).toBeInTheDocument();
    expect(screen.getByLabelText('Win against Bears, 74-68')).toHaveTextContent('W');
    expect(leaguesApi.getPublicStandings).toHaveBeenCalledWith('metro-league', 'season-1');
  });
});
