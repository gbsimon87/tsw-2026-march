import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { gamesApi } from '../../games/api/gamesApi';
import { AdminNewLeagueGamePage } from './AdminNewLeagueGamePage';
import { leaguesApi } from '../api/leaguesApi';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../games/api/gamesApi', () => ({
  gamesApi: {
    create: vi.fn(),
  },
}));

vi.mock('../api/leaguesApi', () => ({
  leaguesApi: {
    getById: vi.fn(),
    listTeams: vi.fn(),
  },
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/admin/leagues/league-1/games/new']}>
      <Routes>
        <Route path="/admin/leagues/:leagueId/games/new" element={<AdminNewLeagueGamePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminNewLeagueGamePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test('warns about short rosters while allowing a valid matchup to be created', async () => {
    leaguesApi.getById.mockResolvedValue({ league: { id: 'league-1', name: 'City League' } });
    leaguesApi.listTeams.mockResolvedValue({
      teams: [
        { id: 'home-team', name: 'Home Squad', activeRosterCount: 4 },
        { id: 'away-team', name: 'Away Squad', activeRosterCount: 5 },
      ],
    });
    gamesApi.create.mockResolvedValue({ game: { id: 'game-1' } });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/fewer than five active players/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Home Squad: 4\/5 active/i)).toBeInTheDocument();

    const submitButton = screen.getByRole('button', { name: /Create and Start Tracking/i });
    expect(submitButton).toBeEnabled();

    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(gamesApi.create).toHaveBeenCalledWith({
        gameContext: 'league',
        trackingMode: 'dual_team',
        leagueId: 'league-1',
        homeLeagueTeamId: 'home-team',
        awayLeagueTeamId: 'away-team',
        initialActiveSide: 'home',
      });
    });
    expect(mockNavigate).toHaveBeenCalledWith('/games/game-1/track');
  });
});
