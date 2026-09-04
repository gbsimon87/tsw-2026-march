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
    createTeam: vi.fn(),
    getGames: vi.fn(),
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
    leaguesApi.getGames.mockResolvedValue({ games: [] });
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
      expect(screen.getByRole('button', { name: /Home Squad 4\/5/i })).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Scheduled At')).toHaveClass('min-w-0', 'max-w-full');

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
        gameFormat: {
          regulationSegmentType: 'quarter',
          regulationSegmentDurationSeconds: 600,
          overtimeDurationSeconds: 300,
        },
      });
    });
    expect(mockNavigate).toHaveBeenCalledWith('/games/game-1/track');
  });

  test('swaps home and away when the league has exactly two teams', async () => {
    leaguesApi.getById.mockResolvedValue({ league: { id: 'league-1', name: 'City League' } });
    leaguesApi.listTeams.mockResolvedValue({
      teams: [
        { id: 'team-1', name: 'Falcons', activeRosterCount: 5 },
        { id: 'team-2', name: 'Wolves', activeRosterCount: 5 },
      ],
    });
    gamesApi.create.mockResolvedValue({ game: { id: 'game-2' } });

    renderPage();

    const swapButton = await screen.findByRole('button', {
      name: 'Swap home and away teams',
    });
    fireEvent.click(swapButton);

    expect(screen.getByPlaceholderText('Falcons at Wolves')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Create and Start Tracking/i }));

    await waitFor(() => {
      expect(gamesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          homeLeagueTeamId: 'team-2',
          awayLeagueTeamId: 'team-1',
          initialActiveSide: 'away',
        })
      );
    });
  });

  test('creates and selects both teams inline when a new league has no teams', async () => {
    leaguesApi.getById.mockResolvedValue({ league: { id: 'league-1', name: 'New League' } });
    leaguesApi.listTeams.mockResolvedValue({ teams: [] });
    leaguesApi.createTeam
      .mockResolvedValueOnce({ team: { id: 'home-team', name: 'Falcons' } })
      .mockResolvedValueOnce({ team: { id: 'away-team', name: 'Wolves' } });
    gamesApi.create.mockResolvedValue({ game: { id: 'game-3' } });

    renderPage();

    expect(
      await screen.findByText('Create the home and away teams to continue.')
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Home Team'), { target: { value: 'Falcons' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Create' })[0]);
    await waitFor(() => expect(screen.getByText('Falcons')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Away Team'), { target: { value: 'Wolves' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    const submitButton = await screen.findByRole('button', {
      name: /Create and Start Tracking/i,
    });
    await waitFor(() => expect(submitButton).toBeEnabled());
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(leaguesApi.createTeam).toHaveBeenNthCalledWith(1, 'league-1', { name: 'Falcons' });
      expect(leaguesApi.createTeam).toHaveBeenNthCalledWith(2, 'league-1', { name: 'Wolves' });
      expect(gamesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          homeLeagueTeamId: 'home-team',
          awayLeagueTeamId: 'away-team',
        })
      );
    });
  });

  test('reuses a previous addressed venue in the new game payload', async () => {
    leaguesApi.getById.mockResolvedValue({ league: { id: 'league-1', name: 'City League' } });
    leaguesApi.listTeams.mockResolvedValue({
      teams: [
        { id: 'home-team', name: 'Falcons', activeRosterCount: 5 },
        { id: 'away-team', name: 'Wolves', activeRosterCount: 5 },
      ],
    });
    leaguesApi.getGames.mockResolvedValue({
      games: [
        {
          venue: 'Central Court',
          venueAddress: { addressLine1: '1 Main St', city: 'London', country: 'UK' },
        },
      ],
    });
    gamesApi.create.mockResolvedValue({ game: { id: 'game-4' } });

    renderPage();

    const venueSelect = await screen.findByRole('combobox', { name: 'Use a previous venue' });
    fireEvent.change(venueSelect, { target: { value: venueSelect.options[1].value } });
    expect(screen.getByDisplayValue('Central Court')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1 Main St')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Create and Start Tracking/i }));

    await waitFor(() => {
      expect(gamesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          venue: 'Central Court',
          venueAddress: expect.objectContaining({
            addressLine1: '1 Main St',
            city: 'London',
            country: 'UK',
          }),
        })
      );
    });
  });
});
