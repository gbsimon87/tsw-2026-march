import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AdminLeagueSchedulePage } from './AdminLeagueSchedulePage';
import { leaguesApi } from '../api/leaguesApi';

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../api/leaguesApi', () => ({
  leaguesApi: {
    getById: vi.fn(),
    bulkCreateGames: vi.fn(),
  },
}));

function buildLeague(overrides = {}) {
  return {
    id: 'league-1',
    name: 'City League',
    status: 'active',
    currentSeason: { id: 'season-1', label: 'Spring 2026', status: 'active' },
    teams: [
      { id: 't1', name: 'Hawks' },
      { id: 't2', name: 'Bisons' },
      { id: 't3', name: 'Owls' },
      { id: 't4', name: 'Foxes' },
    ],
    viewerContext: { viewerRole: 'league_manager', managedTeamIds: [] },
    ...overrides,
  };
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/admin/leagues/league-1/schedule']}>
      <Routes>
        <Route path="/admin/leagues/:leagueId/schedule" element={<AdminLeagueSchedulePage />} />
      </Routes>
    </MemoryRouter>
  );
}

async function suggestPairings() {
  fireEvent.click(await screen.findByRole('button', { name: /suggest pairings/i }));
}

function setSlots(value) {
  fireEvent.change(screen.getByLabelText(/time slots/i), { target: { value } });
}

afterEach(cleanup);

describe('AdminLeagueSchedulePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaguesApi.getById.mockResolvedValue({ league: buildLeague() });
    leaguesApi.bulkCreateGames.mockResolvedValue({ created: 6, replaced: 0, games: [] });
  });

  test('shows the league name', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: /build schedule/i })).toBeInTheDocument();
    expect(screen.getAllByText('City League').length).toBeGreaterThan(0);
  });

  test('generates a full round-robin draft from the league teams', async () => {
    renderPage();
    await suggestPairings();

    // 4 teams -> 6 games, no byes.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /remove game/i }).length).toBe(12)
    );
    expect(screen.getByRole('button', { name: /create 6 games/i })).toBeInTheDocument();
  });

  test('submits only game rows, never bye rows', async () => {
    leaguesApi.getById.mockResolvedValue({
      league: buildLeague({
        teams: [
          { id: 't1', name: 'Hawks' },
          { id: 't2', name: 'Bisons' },
          { id: 't3', name: 'Owls' },
        ],
      }),
    });

    renderPage();
    await suggestPairings();
    fireEvent.click(await screen.findByRole('button', { name: /create 3 games/i }));

    await waitFor(() => expect(leaguesApi.bulkCreateGames).toHaveBeenCalled());

    const [leagueId, payload] = leaguesApi.bulkCreateGames.mock.calls[0];
    expect(leagueId).toBe('league-1');
    expect(payload.games).toHaveLength(3);
    expect(payload.games.every((game) => game.homeLeagueTeamId && game.awayLeagueTeamId)).toBe(
      true
    );
    expect(payload.games.every((game) => typeof game.scheduledAt === 'string')).toBe(true);
    expect(payload.games.some((game) => 'isBye' in game)).toBe(false);
  });

  test('blocks committing while a slot overflow is unacknowledged', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /build schedule/i });

    setSlots('10:00');
    await suggestPairings();

    expect(await screen.findByText(/couldn't fit/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create \d+ games/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /i understand/i }));

    expect(screen.getByRole('button', { name: /create \d+ games/i })).toBeEnabled();
  });

  test('asks for confirmation before replacing existing games', async () => {
    renderPage();
    await suggestPairings();

    fireEvent.click(screen.getByRole('checkbox', { name: /replace/i }));
    fireEvent.click(screen.getByRole('button', { name: /create 6 games/i }));

    expect(await screen.findByText(/will be deleted/i)).toBeInTheDocument();
    expect(leaguesApi.bulkCreateGames).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^replace and create$/i }));

    await waitFor(() => expect(leaguesApi.bulkCreateGames).toHaveBeenCalled());
    expect(leaguesApi.bulkCreateGames.mock.calls[0][1].replaceExisting).toBe(true);
  });

  test('commits directly when replace is not requested', async () => {
    renderPage();
    await suggestPairings();

    fireEvent.click(screen.getByRole('button', { name: /create 6 games/i }));

    await waitFor(() => expect(leaguesApi.bulkCreateGames).toHaveBeenCalled());
    expect(leaguesApi.bulkCreateGames.mock.calls[0][1].replaceExisting).toBe(false);
  });

  test('navigates back to the league page on success', async () => {
    renderPage();
    await suggestPairings();
    fireEvent.click(screen.getByRole('button', { name: /create 6 games/i }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/admin/leagues/league-1'));
  });

  test('surfaces the real server error message', async () => {
    leaguesApi.bulkCreateGames.mockRejectedValue(
      Object.assign(new Error('League has no active season'), { status: 400 })
    );

    renderPage();
    await suggestPairings();
    fireEvent.click(screen.getByRole('button', { name: /create 6 games/i }));

    expect(await screen.findByText(/no active season/i)).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  test('removes a row from the draft', async () => {
    renderPage();
    await suggestPairings();
    await screen.findByRole('button', { name: /create 6 games/i });

    fireEvent.click(screen.getAllByRole('button', { name: /remove game/i })[0]);

    expect(await screen.findByRole('button', { name: /create 5 games/i })).toBeInTheDocument();
  });

  test('swaps home and away for a row', async () => {
    renderPage();
    await suggestPairings();
    await screen.findByRole('button', { name: /create 6 games/i });

    fireEvent.click(screen.getAllByRole('button', { name: /swap home and away/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /create 6 games/i }));

    await waitFor(() => expect(leaguesApi.bulkCreateGames).toHaveBeenCalled());
    const firstGame = leaguesApi.bulkCreateGames.mock.calls[0][1].games[0];
    // Round 1 game 1 is Hawks(home) v Foxes(away) before the swap.
    expect(firstGame.homeLeagueTeamId).toBe('t4');
    expect(firstGame.awayLeagueTeamId).toBe('t1');
  });

  test('starts an empty draft and adds a game by hand', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /start empty/i }));

    expect(screen.getByText(/no games/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add game/i }));

    expect(await screen.findByRole('button', { name: /create 1 game/i })).toBeInTheDocument();
  });

  test('excludes a deselected team from the generated draft', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /build schedule/i });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Foxes' }));
    await suggestPairings();

    // 3 remaining teams -> 3 games.
    expect(await screen.findByRole('button', { name: /create 3 games/i })).toBeInTheDocument();
  });

  test('warns instead of generating when fewer than two teams are selected', async () => {
    leaguesApi.getById.mockResolvedValue({
      league: buildLeague({ teams: [{ id: 't1', name: 'Hawks' }] }),
    });

    renderPage();
    await suggestPairings();

    expect(await screen.findByText(/at least two teams/i)).toBeInTheDocument();
  });

  test('tells the admin when the league has no active season', async () => {
    leaguesApi.getById.mockResolvedValue({
      league: buildLeague({ currentSeason: null }),
    });

    renderPage();

    expect(await screen.findByText(/no active season/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to season settings/i })).toHaveAttribute(
      'href',
      '/admin/leagues/league-1?tab=settings#season'
    );
    expect(screen.queryByRole('button', { name: /suggest pairings/i })).not.toBeInTheDocument();
  });

  test('sends a trimmed venue and omits an empty one', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /build schedule/i });

    fireEvent.change(screen.getByLabelText(/default venue/i), {
      target: { value: '  Main Court  ' },
    });
    await suggestPairings();
    fireEvent.click(screen.getByRole('button', { name: /create 6 games/i }));

    await waitFor(() => expect(leaguesApi.bulkCreateGames).toHaveBeenCalled());
    expect(leaguesApi.bulkCreateGames.mock.calls[0][1].games[0].venue).toBe('Main Court');
  });
});
