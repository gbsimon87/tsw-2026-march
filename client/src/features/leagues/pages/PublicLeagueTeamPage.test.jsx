import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PublicLeagueTeamPage } from './PublicLeagueTeamPage';
import { leaguesApi } from '../api/leaguesApi';

vi.mock('../../../app/store/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('../api/leaguesApi', () => ({
  leaguesApi: {
    getPublicTeam: vi.fn(),
    createJoinRequest: vi.fn(),
  },
}));

const response = {
  league: {
    id: 'league-1',
    name: 'Metro League',
    slug: 'metro-league',
    isPublic: false,
  },
  team: {
    id: 'team-a',
    name: 'Falcons',
    slug: 'falcons',
    standingsPosition: 2,
    roster: [],
    stats: [],
    games: [
      {
        id: 'game-1',
        status: 'completed',
        completedAt: '2026-03-01T18:00:00.000Z',
        homeLeagueTeamId: 'team-a',
        awayLeagueTeamId: 'team-b',
        homeTeamName: 'Falcons',
        awayTeamName: 'Bears',
        homePoints: 70,
        awayPoints: 60,
      },
      {
        id: 'game-2',
        status: 'completed',
        completedAt: '2026-03-08T18:00:00.000Z',
        homeLeagueTeamId: 'team-c',
        awayLeagueTeamId: 'team-a',
        homeTeamName: 'Owls',
        awayTeamName: 'Falcons',
        homePoints: 80,
        awayPoints: 70,
      },
    ],
  },
};

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/league/metro-league/teams/falcons']}>
      <Routes>
        <Route path="/league/:leagueSlug/teams/:teamSlug" element={<PublicLeagueTeamPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PublicLeagueTeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaguesApi.getPublicTeam.mockResolvedValue(response);
  });

  test('shows the team recent form with the latest result on the right', async () => {
    renderPage();

    const win = await screen.findByLabelText('Win against Bears, 70-60');
    const loss = screen.getByLabelText('Loss against Owls, 70-80');

    expect(win).toHaveTextContent('W');
    expect(loss).toHaveTextContent('L');
    expect(win.compareDocumentPosition(loss)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(leaguesApi.getPublicTeam).toHaveBeenCalledWith('metro-league', 'falcons');
  });
});
