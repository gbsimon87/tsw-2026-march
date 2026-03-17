import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GameTrackPage } from './GameTrackPage';

const apiMocks = vi.hoisted(() => ({
  getById: vi.fn(),
  appendEvent: vi.fn(),
  setLineup: vi.fn(),
  removeEvent: vi.fn(),
  finish: vi.fn(),
}));

vi.mock('../api/gamesApi', () => ({
  gamesApi: apiMocks,
}));

function createPlayers() {
  return [
    { id: 'player-1', displayName: 'Alex', isActive: true },
    { id: 'player-2', displayName: 'Blake', isActive: true },
    { id: 'player-3', displayName: 'Casey', isActive: true },
    { id: 'player-4', displayName: 'Drew', isActive: true },
    { id: 'player-5', displayName: 'Evan', isActive: true },
    { id: 'player-6', displayName: 'Flynn', isActive: true },
  ];
}

function createBoxPlayers(players) {
  return players.map((player) => ({
    playerId: player.id,
    displayName: player.displayName,
    fg2m: 0,
    fg2a: 0,
    fg3m: 0,
    fg3a: 0,
    points: 0,
    ast: 0,
    reb: 0,
    oreb: 0,
    dreb: 0,
    ftm: 0,
    fta: 0,
    stl: 0,
    tov: 0,
    foul: 0,
  }));
}

function createResponse(overrides = {}) {
  const players = overrides.team?.players || createPlayers();

  return {
    game: {
      id: 'game-1',
      title: 'Dev Scrimmage',
      opponent: 'Falcons',
      status: 'in_progress',
      events: [],
      startingLineupPlayerIds: [],
      currentLineupPlayerIds: [],
      ...overrides.game,
    },
    team: {
      id: 'team-1',
      name: 'TSW Team',
      players,
      ...overrides.team,
    },
    boxScore: {
      players: createBoxPlayers(players),
      teamTotals: {
        fg2m: 0,
        fg2a: 0,
        fg3m: 0,
        fg3a: 0,
        points: 0,
        ast: 0,
        reb: 0,
        oreb: 0,
        dreb: 0,
        ftm: 0,
        fta: 0,
        stl: 0,
        tov: 0,
        foul: 0,
      },
      opponentTotals: {
        points: 0,
      },
      ...overrides.boxScore,
    },
    gameSummary: {
      teamPoints: 0,
      opponentPoints: 0,
      hasOpponentScore: false,
      ...overrides.gameSummary,
    },
  };
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/games/game-1/track']}>
      <Routes>
        <Route path="/games/:gameId/track" element={<GameTrackPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function getEventPicker() {
  return screen.getByRole('button', { name: /Close event picker/i }).parentElement?.parentElement;
}

function getOnCourtCard() {
  return screen.getByText(/^On Court$/i).parentElement;
}

describe('GameTrackPage', () => {
  let currentResponse;

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    currentResponse = createResponse();

    apiMocks.getById.mockReset();
    apiMocks.appendEvent.mockReset();
    apiMocks.setLineup.mockReset();
    apiMocks.removeEvent.mockReset();
    apiMocks.finish.mockReset();

    apiMocks.getById.mockImplementation(() => Promise.resolve(currentResponse));

    apiMocks.setLineup.mockImplementation((gameId, playerIds) => {
      currentResponse = {
        ...currentResponse,
        game: {
          ...currentResponse.game,
          startingLineupPlayerIds: playerIds,
          currentLineupPlayerIds: playerIds,
        },
      };

      return Promise.resolve({
        game: currentResponse.game,
        boxScore: currentResponse.boxScore,
        gameSummary: currentResponse.gameSummary,
      });
    });

    apiMocks.appendEvent.mockImplementation((gameId, payload) => {
      const eventId = `event-${currentResponse.game.events.length + 1}`;
      let nextLineup = currentResponse.game.currentLineupPlayerIds;

      if (payload.statType === 'SUB_OUT') {
        nextLineup = currentResponse.game.currentLineupPlayerIds.filter(
          (id) => id !== payload.playerId
        );
      }

      if (payload.statType === 'SUB_IN') {
        nextLineup = [...currentResponse.game.currentLineupPlayerIds, payload.playerId];
      }

      currentResponse = {
        ...currentResponse,
        game: {
          ...currentResponse.game,
          currentLineupPlayerIds: nextLineup,
          events: [...currentResponse.game.events, { id: eventId, ...payload }],
        },
      };

      return Promise.resolve({
        game: currentResponse.game,
        boxScore: currentResponse.boxScore,
        gameSummary: currentResponse.gameSummary,
      });
    });

    apiMocks.removeEvent.mockImplementation((gameId, eventId) => {
      currentResponse = {
        ...currentResponse,
        game: {
          ...currentResponse.game,
          events: currentResponse.game.events.filter((event) => event.id !== eventId),
        },
      };

      return Promise.resolve({
        game: currentResponse.game,
        boxScore: currentResponse.boxScore,
        gameSummary: currentResponse.gameSummary,
      });
    });
  });

  test('blocks full-screen tracking until the starting five is set', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Set starting five before tracking/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Open Full Screen Tracking/i })).toBeDisabled();
    expect(screen.queryByText(/Selected Player/i)).not.toBeInTheDocument();
  });

  test('saves the starting five and enables full-screen tracking', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Set Starting Five/i })).toBeInTheDocument();
    });

    for (const player of ['Alex', 'Blake', 'Casey', 'Drew', 'Evan']) {
      fireEvent.click(screen.getByRole('button', { name: player }));
    }

    fireEvent.click(screen.getByRole('button', { name: /Set Starting Five/i }));

    await waitFor(() => {
      expect(apiMocks.setLineup).toHaveBeenCalledWith('game-1', [
        'player-1',
        'player-2',
        'player-3',
        'player-4',
        'player-5',
      ]);
    });

    expect(screen.getByRole('button', { name: /Open Full Screen Tracking/i })).toBeEnabled();
    expect(screen.getByText(/Last action: Starting five set/i)).toBeInTheDocument();
    expect(screen.getByText(/^Bench$/i)).toBeInTheDocument();
    expect(screen.getAllByText('Flynn').length).toBeGreaterThan(0);
  });

  test('shows only on-court players for assist follow-up and includes No Assist', async () => {
    currentResponse = createResponse({
      game: {
        currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Open Full Screen Tracking/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Open Full Screen Tracking/i }));
    fireEvent.click(within(getOnCourtCard()).getByRole('button', { name: 'Blake' }));

    const court = screen.getByTestId('interactive-court-image');
    court.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 500,
      height: 940,
      right: 500,
      bottom: 940,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.click(court, { clientX: 475, clientY: 900 });
    fireEvent.click(screen.getByRole('button', { name: /Shot Make/i }));

    await waitFor(() => {
      expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText(/Who assisted\?/i)).toBeInTheDocument();
    const overlay = getEventPicker();
    expect(within(overlay).queryByRole('button', { name: 'Flynn' })).not.toBeInTheDocument();
    expect(within(overlay).queryByRole('button', { name: 'Blake' })).not.toBeInTheDocument();
    expect(within(overlay).getByRole('button', { name: 'Alex' })).toBeInTheDocument();
    expect(within(overlay).getByRole('button', { name: 'Casey' })).toBeInTheDocument();
    expect(within(overlay).getByRole('button', { name: 'Drew' })).toBeInTheDocument();
    expect(within(overlay).getByRole('button', { name: 'Evan' })).toBeInTheDocument();
    expect(within(overlay).getByRole('button', { name: /No Assist/i })).toBeInTheDocument();
  });

  test('shows all five on-court players for rebound follow-up and logs opponent rebound', async () => {
    currentResponse = createResponse({
      game: {
        currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Open Full Screen Tracking/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Open Full Screen Tracking/i }));

    const court = screen.getByTestId('interactive-court-image');
    court.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 500,
      height: 940,
      right: 500,
      bottom: 940,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.click(court, { clientX: 250, clientY: 800 });
    fireEvent.click(screen.getByRole('button', { name: /FT Miss/i }));

    await waitFor(() => {
      expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText(/Who got the rebound\?/i)).toBeInTheDocument();
    const overlay = getEventPicker();
    for (const player of ['Alex', 'Blake', 'Casey', 'Drew', 'Evan']) {
      expect(within(overlay).getByRole('button', { name: player })).toBeInTheDocument();
    }
    expect(within(overlay).queryByRole('button', { name: 'Flynn' })).not.toBeInTheDocument();

    fireEvent.click(within(overlay).getByRole('button', { name: /Opponent Rebound/i }));

    await waitFor(() => {
      expect(apiMocks.appendEvent).toHaveBeenCalledTimes(2);
    });

    expect(apiMocks.appendEvent.mock.calls[1][1]).toEqual({ statType: 'OPP_REB' });
  });

  test('records modal quick stats without coordinates and modal opponent scoring without player selection', async () => {
    currentResponse = createResponse({
      game: {
        currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Open Full Screen Tracking/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Open Full Screen Tracking/i }));
    fireEvent.click(within(getOnCourtCard()).getByRole('button', { name: 'Casey' }));

    const court = screen.getByTestId('interactive-court-image');
    court.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 500,
      height: 940,
      right: 500,
      bottom: 940,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.click(court, { clientX: 250, clientY: 800 });
    fireEvent.click(within(getEventPicker()).getByRole('button', { name: 'STL' }));

    await waitFor(() => {
      expect(apiMocks.appendEvent).toHaveBeenCalledWith('game-1', {
        playerId: 'player-3',
        statType: 'STL',
      });
    });

    fireEvent.click(court, { clientX: 250, clientY: 800 });
    fireEvent.click(within(getEventPicker()).getByRole('button', { name: /Opp \+2/i }));

    await waitFor(() => {
      expect(apiMocks.appendEvent).toHaveBeenCalledWith('game-1', {
        statType: 'OPP_FG2_MADE',
      });
    });

    const quickStatPayload = apiMocks.appendEvent.mock.calls[0][1];
    expect(quickStatPayload.x).toBeUndefined();
    expect(quickStatPayload.y).toBeUndefined();
    expect(quickStatPayload.zoneId).toBeUndefined();
  });

  test('updates on-court and bench lists after a substitution', async () => {
    currentResponse = createResponse({
      game: {
        currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/^On Court$/i)).toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'player-1' } });
    fireEvent.change(selects[1], { target: { value: 'player-6' } });
    fireEvent.click(screen.getByRole('button', { name: /Make Substitution/i }));

    await waitFor(() => {
      expect(apiMocks.appendEvent).toHaveBeenNthCalledWith(1, 'game-1', {
        playerId: 'player-1',
        relatedPlayerId: 'player-6',
        statType: 'SUB_OUT',
      });
      expect(apiMocks.appendEvent).toHaveBeenNthCalledWith(2, 'game-1', {
        playerId: 'player-6',
        relatedPlayerId: 'player-1',
        statType: 'SUB_IN',
      });
    });

    const onCourtSection = screen.getByText(/^On Court$/i).parentElement;
    const benchSection = screen.getByText(/^Bench$/i).parentElement;

    expect(within(onCourtSection).getByRole('button', { name: 'Flynn' })).toBeInTheDocument();
    expect(within(benchSection).getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText(/Last action: Substitution recorded/i)).toBeInTheDocument();
  });

  test('renders the live box score with expanded stat columns', async () => {
    currentResponse = createResponse({
      game: {
        currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
      },
      boxScore: {
        players: [
          {
            playerId: 'player-1',
            displayName: 'Alex',
            fg2m: 5,
            fg2a: 7,
            fg3m: 3,
            fg3a: 5,
            points: 22,
            ast: 1,
            reb: 6,
            oreb: 2,
            dreb: 4,
            ftm: 3,
            fta: 5,
            stl: 2,
            tov: 1,
            foul: 3,
          },
        ],
        teamTotals: {
          fg2m: 6,
          fg2a: 9,
          fg3m: 3,
          fg3a: 6,
          points: 24,
          ast: 4,
          reb: 11,
          oreb: 3,
          dreb: 8,
          ftm: 3,
          fta: 5,
          stl: 5,
          tov: 7,
          foul: 9,
        },
        opponentTotals: {
          points: 18,
        },
      },
      gameSummary: {
        teamPoints: 24,
        opponentPoints: 18,
        hasOpponentScore: true,
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Live Box Score')).toBeInTheDocument();
    });

    expect(screen.getByText('STL')).toBeInTheDocument();
    expect(screen.getByText('TOV')).toBeInTheDocument();
    expect(screen.getByText('FOUL')).toBeInTheDocument();
    expect(screen.queryByText('2/7')).not.toBeInTheDocument();
    expect(screen.getAllByText('5/7').length).toBeGreaterThan(0);
    expect(screen.getByText('71.4%')).toBeInTheDocument();
    expect(screen.getByText('Team Total')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });
});
