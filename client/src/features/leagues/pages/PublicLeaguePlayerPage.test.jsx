import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PublicLeaguePlayerPage } from './PublicLeaguePlayerPage';
import { leaguesApi } from '../api/leaguesApi';

vi.mock('../api/leaguesApi', () => ({
  leaguesApi: {
    getPublicPlayer: vi.fn(),
    createJoinRequest: vi.fn(),
  },
}));

vi.mock('../../../app/store/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('../../follows/components/FollowButton', () => ({
  FollowButton: () => null,
}));

vi.mock('../../players/components/PlayerMilestones', () => ({
  PlayerMilestones: () => null,
}));

function statLine(points, overrides = {}) {
  return {
    ftm: 0,
    fta: 0,
    fg2m: 0,
    fg2a: 0,
    fg3m: 0,
    fg3a: 0,
    ast: 0,
    oreb: 0,
    dreb: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    foul: 0,
    reb: 0,
    points,
    ...overrides,
  };
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/league/city/teams/hawks/players/player-1']}>
      <Routes>
        <Route
          path="/league/:leagueSlug/teams/:teamSlug/players/:leaguePlayerId"
          element={<PublicLeaguePlayerPage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('PublicLeaguePlayerPage statistics filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaguesApi.getPublicPlayer.mockResolvedValue({
      league: { id: 'league-1', name: 'City League', slug: 'city', isPublic: true },
      team: { id: 'team-1', name: 'Hawks', slug: 'hawks', logo: null },
      player: {
        id: 'player-1',
        displayName: 'Avery Brooks',
        jerseyNumber: 8,
        avatarUrl: null,
        isClaimed: true,
      },
      seasons: [
        { id: 'season-26', label: '2026 Spring' },
        { id: 'season-25', label: '2025 Spring' },
      ],
      games: [
        {
          gameId: 'game-26',
          seasonId: 'season-26',
          opponent: 'Falcons',
          completedAt: '2026-03-01T00:00:00.000Z',
          stats: statLine(12, { reb: 4, ast: 2, stl: 1 }),
        },
        {
          gameId: 'game-25',
          seasonId: 'season-25',
          opponent: 'Panthers',
          completedAt: '2025-03-01T00:00:00.000Z',
          stats: statLine(22, { reb: 9, ast: 7, stl: 3 }),
        },
      ],
      highlights: [],
      milestones: { recent: [], total: 0 },
    });
  });

  afterEach(cleanup);

  test('uses league season labels and filters totals and columns together', async () => {
    renderPage();

    expect(await screen.findByText('Falcons')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Season' }), {
      target: { value: 'season:season-25' },
    });

    expect(screen.queryByText('Falcons')).not.toBeInTheDocument();
    expect(screen.getByText('Panthers')).toBeInTheDocument();
    expect(screen.getAllByText('22').length).toBeGreaterThanOrEqual(1);

    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), {
      target: { value: 'rebounding' },
    });

    const table = screen.getByRole('table');
    expect(within(table).getByRole('button', { name: /^REB$/i })).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: /^PTS$/i })).not.toBeInTheDocument();
  });
});
