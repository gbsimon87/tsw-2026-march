import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GameTrackPage } from './GameTrackPage';

const apiMocks = vi.hoisted(() => ({
  getById: vi.fn(),
  appendEvent: vi.fn(),
  insertEventBefore: vi.fn(),
  setLineup: vi.fn(),
  removeEvent: vi.fn(),
  finish: vi.fn(),
  update: vi.fn(),
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
  const closeButtons = screen.getAllByRole('button', { name: /Close event picker/i });
  return closeButtons.at(-1).parentElement?.parentElement;
}

function getActiveCourt() {
  return screen.getAllByTestId('interactive-court-image').at(-1);
}

function getFirstButtonByName(name) {
  return screen.getAllByRole('button', { name })[0];
}

function getLastButtonByName(name) {
  return screen.getAllByRole('button', { name }).at(-1);
}

function playerButtonName(playerName) {
  return new RegExp(`(^|\\s)${playerName}$`);
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
    apiMocks.insertEventBefore.mockReset();
    apiMocks.setLineup.mockReset();
    apiMocks.removeEvent.mockReset();
    apiMocks.finish.mockReset();
    apiMocks.update.mockReset();

    apiMocks.getById.mockImplementation(() => Promise.resolve(currentResponse));

    apiMocks.update.mockImplementation((gameId, payload) => {
      currentResponse = {
        ...currentResponse,
        game: {
          ...currentResponse.game,
          ...payload,
        },
      };

      return Promise.resolve({
        game: currentResponse.game,
        boxScore: currentResponse.boxScore,
        gameSummary: currentResponse.gameSummary,
      });
    });

    apiMocks.setLineup.mockImplementation((gameId, payload) => {
      const playerIds = Array.isArray(payload) ? payload : payload.playerIds;

      if (payload?.teamSide) {
        currentResponse = {
          ...currentResponse,
          lineups: {
            ...currentResponse.lineups,
            [payload.teamSide]: {
              startingPlayerIds: playerIds,
              currentPlayerIds: playerIds,
            },
          },
        };
      } else {
        currentResponse = {
          ...currentResponse,
          game: {
            ...currentResponse.game,
            startingLineupPlayerIds: playerIds,
            currentLineupPlayerIds: playerIds,
          },
        };
      }

      return Promise.resolve({
        game: currentResponse.game,
        lineups: currentResponse.lineups,
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

    apiMocks.insertEventBefore.mockImplementation((gameId, eventId, payload) => {
      const insertIndex = currentResponse.game.events.findIndex((event) => event.id === eventId);
      const nextEvent = { id: `event-${currentResponse.game.events.length + 1}`, ...payload };
      const nextEvents = [...currentResponse.game.events];
      nextEvents.splice(insertIndex, 0, nextEvent);
      currentResponse = {
        ...currentResponse,
        game: {
          ...currentResponse.game,
          events: nextEvents,
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
      expect(screen.getByRole('button', { name: /Fullscreen/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Fullscreen/i }));

    expect(screen.getByText(/Set starting five before tracking/i)).toBeInTheDocument();
    expect(screen.queryByText(/Fullscreen Tracking/i)).not.toBeInTheDocument();
  });

  test('inserts a missed quick stat before a selected recent event', async () => {
    currentResponse = createResponse({
      game: {
        events: [
          { id: 'event-1', playerId: 'player-1', statType: 'FG2_MADE' },
          { id: 'event-2', playerId: 'player-2', statType: 'STL' },
          { id: 'event-3', playerId: 'player-3', statType: 'TOV' },
        ],
        startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Recent Events/i)).toBeInTheDocument();
    });

    const insertButtons = screen.getAllByRole('button', { name: 'Insert Before' });
    fireEvent.click(insertButtons[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Assist' }));

    await waitFor(() => {
      expect(apiMocks.insertEventBefore).toHaveBeenCalledWith('game-1', 'event-2', {
        playerId: 'player-1',
        statType: 'AST',
      });
    });
  });

  test('saves the starting five and enables full-screen tracking', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Lineup/i })).toBeInTheDocument();
    });

    for (const player of ['Alex', 'Blake', 'Casey', 'Drew', 'Evan']) {
      fireEvent.click(screen.getByLabelText(player));
    }

    fireEvent.click(screen.getByRole('button', { name: /Save Lineup/i }));

    await waitFor(() => {
      expect(apiMocks.setLineup).toHaveBeenCalledWith('game-1', {
        playerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
      });
    });

    expect(screen.getByRole('button', { name: /Fullscreen/i })).toBeEnabled();
    expect(screen.getByText(/Starting five set/i)).toBeInTheDocument();
    expect(screen.getByText(/Bench \(1\)/i)).toBeInTheDocument();
  });

  test('switches active side in fullscreen and clears transient event state for dual-team games', async () => {
    const homePlayers = createPlayers();
    const awayPlayers = createPlayers().map((player, index) => ({
      ...player,
      id: `away-${index + 1}`,
      displayName: `Away ${index + 1}`,
    }));

    currentResponse = {
      game: {
        id: 'game-1',
        title: 'League Match',
        status: 'in_progress',
        trackingMode: 'dual_team',
        events: [],
      },
      participants: {
        home: { displayName: 'Home Squad', players: homePlayers },
        away: { displayName: 'Away Squad', players: awayPlayers },
      },
      lineups: {
        home: {
          startingPlayerIds: homePlayers.slice(0, 5).map((player) => player.id),
          currentPlayerIds: homePlayers.slice(0, 5).map((player) => player.id),
        },
        away: {
          startingPlayerIds: awayPlayers.slice(0, 5).map((player) => player.id),
          currentPlayerIds: awayPlayers.slice(0, 5).map((player) => player.id),
        },
      },
      boxScore: {
        home: { players: createBoxPlayers(homePlayers), totals: { points: 0 } },
        away: { players: createBoxPlayers(awayPlayers), totals: { points: 0 } },
      },
      gameSummary: { homePoints: 0, awayPoints: 0 },
    };

    apiMocks.getById.mockResolvedValue(currentResponse);

    renderPage();

    await waitFor(() => {
      expect(getFirstButtonByName('Home Squad')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Fullscreen/i }));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Away Squad' }).length).toBeGreaterThan(0);
    });

    fireEvent.click(getActiveCourt());

    await waitFor(() => {
      expect(screen.getAllByText(/Add Event/i).length).toBeGreaterThan(0);
    });

    fireEvent.click(getFirstButtonByName('Away Squad'));

    await waitFor(() => {
      expect(screen.queryAllByText(/Add Event/i)).toHaveLength(0);
    });
  });

  function createLeagueDualTeamResponse({ homeReady = false, awayReady = false } = {}) {
    const homePlayers = createPlayers();
    const awayPlayers = createPlayers().map((player, index) => ({
      ...player,
      id: `away-${index + 1}`,
      displayName: `Away ${index + 1}`,
    }));

    return {
      game: {
        id: 'game-1',
        title: 'League Match',
        status: 'in_progress',
        trackingMode: 'dual_team',
        gameContext: 'league',
        events: [],
      },
      participants: {
        home: { displayName: 'Home Squad', players: homePlayers },
        away: { displayName: 'Away Squad', players: awayPlayers },
      },
      lineups: {
        home: {
          startingPlayerIds: homeReady ? homePlayers.slice(0, 5).map((p) => p.id) : [],
          currentPlayerIds: homeReady ? homePlayers.slice(0, 5).map((p) => p.id) : [],
        },
        away: {
          startingPlayerIds: awayReady ? awayPlayers.slice(0, 5).map((p) => p.id) : [],
          currentPlayerIds: awayReady ? awayPlayers.slice(0, 5).map((p) => p.id) : [],
        },
      },
      boxScore: {
        home: { players: createBoxPlayers(homePlayers), totals: { points: 0 } },
        away: { players: createBoxPlayers(awayPlayers), totals: { points: 0 } },
      },
      gameSummary: { homePoints: 0, awayPoints: 0 },
    };
  }

  test('gates a brand-new league dual-team game through home lineup then away lineup before showing normal tabs', async () => {
    currentResponse = createLeagueDualTeamResponse();
    apiMocks.getById.mockResolvedValue(currentResponse);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Set Home Squad Starting Lineup/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Court' })).not.toBeInTheDocument();

    for (const player of ['Alex', 'Blake', 'Casey', 'Drew', 'Evan']) {
      fireEvent.click(screen.getByLabelText(player));
    }
    fireEvent.click(screen.getByRole('button', { name: /Save Lineup/i }));

    await waitFor(() => {
      expect(apiMocks.setLineup).toHaveBeenCalledWith('game-1', {
        playerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        teamSide: 'home',
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Set Away Squad Starting Lineup/i)).toBeInTheDocument();
    });

    for (const player of ['Away 1', 'Away 2', 'Away 3', 'Away 4', 'Away 5']) {
      fireEvent.click(screen.getByLabelText(player));
    }
    fireEvent.click(screen.getByRole('button', { name: /Save Lineup/i }));

    await waitFor(() => {
      expect(apiMocks.setLineup).toHaveBeenCalledWith('game-1', {
        playerIds: ['away-1', 'away-2', 'away-3', 'away-4', 'away-5'],
        teamSide: 'away',
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Court' })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Set .* Starting Lineup/i)).not.toBeInTheDocument();
  });

  test('resumes at the away lineup step when the home lineup is already set on load', async () => {
    currentResponse = createLeagueDualTeamResponse({ homeReady: true });
    apiMocks.getById.mockResolvedValue(currentResponse);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Set Away Squad Starting Lineup/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Set Home Squad Starting Lineup/i)).not.toBeInTheDocument();
  });

  test('skips gating and shows normal tabs immediately when both lineups are already set', async () => {
    currentResponse = createLeagueDualTeamResponse({ homeReady: true, awayReady: true });
    apiMocks.getById.mockResolvedValue(currentResponse);

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Court' })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Set .* Starting Lineup/i)).not.toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: /Fullscreen/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Fullscreen/i }));
    fireEvent.click(getLastButtonByName('Blake'));

    const court = getActiveCourt();
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
    fireEvent.click(within(getEventPicker()).getByRole('button', { name: 'Make' }));

    await waitFor(() => {
      expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
    });

    const overlay = getEventPicker();
    expect(within(overlay).getByText(/Who assisted\?/i)).toBeInTheDocument();
    expect(
      within(overlay).queryByRole('button', { name: playerButtonName('Flynn') })
    ).not.toBeInTheDocument();
    expect(
      within(overlay).queryByRole('button', { name: playerButtonName('Blake') })
    ).not.toBeInTheDocument();
    expect(
      within(overlay).getByRole('button', { name: playerButtonName('Alex') })
    ).toBeInTheDocument();
    expect(
      within(overlay).getByRole('button', { name: playerButtonName('Casey') })
    ).toBeInTheDocument();
    expect(
      within(overlay).getByRole('button', { name: playerButtonName('Drew') })
    ).toBeInTheDocument();
    expect(
      within(overlay).getByRole('button', { name: playerButtonName('Evan') })
    ).toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: /Fullscreen/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Fullscreen/i }));

    const court = getActiveCourt();
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
    fireEvent.click(within(getEventPicker()).getByRole('button', { name: 'FT-' }));

    await waitFor(() => {
      expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
    });

    const overlay = getEventPicker();
    expect(within(overlay).getByText(/Who got the rebound\?/i)).toBeInTheDocument();
    for (const player of ['Alex', 'Blake', 'Casey', 'Drew', 'Evan']) {
      expect(
        within(overlay).getByRole('button', { name: playerButtonName(player) })
      ).toBeInTheDocument();
    }
    expect(
      within(overlay).queryByRole('button', { name: playerButtonName('Flynn') })
    ).not.toBeInTheDocument();

    fireEvent.click(within(overlay).getByRole('button', { name: /Opp Rebound/i }));

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
      expect(screen.getByRole('button', { name: /Fullscreen/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Fullscreen/i }));
    fireEvent.click(getLastButtonByName('Casey'));

    const court = getActiveCourt();
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
    fireEvent.click(within(getEventPicker()).getByRole('button', { name: '+2' }));

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
      expect(screen.getByRole('button', { name: playerButtonName('Alex') })).toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'player-1' } });
    fireEvent.change(selects[1], { target: { value: 'player-6' } });
    fireEvent.click(screen.getByRole('button', { name: /Record Sub/i }));

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

    expect(screen.getByRole('button', { name: playerButtonName('Flynn') })).toBeInTheDocument();
    expect(screen.getByText(/Bench \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Substitution recorded/i)).toBeInTheDocument();
  });

  test('renders the score summary and tracking quick actions', async () => {
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
      expect(screen.getByText('TSW Team')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Fullscreen/i }));

    const court = getActiveCourt();
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

    const overlay = getEventPicker();
    expect(within(overlay).getByRole('button', { name: 'STL' })).toBeInTheDocument();
    expect(within(overlay).getByRole('button', { name: 'TOV' })).toBeInTheDocument();
    expect(within(overlay).getByRole('button', { name: 'FOUL' })).toBeInTheDocument();
    expect(within(overlay).getByRole('button', { name: 'DREB' })).toBeInTheDocument();
    expect(screen.getByText('66.7%')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getAllByText('Opponent').length).toBeGreaterThan(0);
  });

  test('rotates the court orientation from the More tab and applies it in both Court and fullscreen views', async () => {
    currentResponse = createResponse({
      game: {
        currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /More/i })).toBeInTheDocument();
    });

    expect(getActiveCourt().style.transform).not.toContain('rotate(90deg)');

    fireEvent.click(screen.getByRole('button', { name: /More/i }));
    fireEvent.click(screen.getByRole('button', { name: /Rotate Court/i }));

    expect(screen.getByText(/Currently horizontal/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Court' }));
    expect(getActiveCourt().style.transform).toContain('rotate(90deg)');

    fireEvent.click(screen.getByRole('button', { name: /Fullscreen/i }));
    expect(getActiveCourt().style.transform).toContain('rotate(90deg)');
  });

  function makeMatchMediaStub(isDesktop, { onListener } = {}) {
    return (query) => ({
      matches: query === '(min-width: 1024px)' ? isDesktop : false,
      media: query,
      onchange: null,
      addEventListener: (event, listener) => {
        if (query === '(min-width: 1024px)') {
          onListener?.(listener);
        }
      },
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }

  function stubMatchMedia(isDesktop) {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = makeMatchMediaStub(isDesktop);
    return () => {
      window.matchMedia = originalMatchMedia;
    };
  }

  test('renders the video panel in a left column on desktop when a video URL is set', async () => {
    const restoreMatchMedia = stubMatchMedia(true);
    try {
      currentResponse = createResponse({
        game: {
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
          startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        },
      });

      renderPage();

      // Desktop video renders edge-to-edge (fill mode, no "Game Video" card heading), so
      // assert on the iframe itself via its title.
      await waitFor(() => {
        expect(screen.getByTitle('Dev Scrimmage')).toBeInTheDocument();
      });
    } finally {
      restoreMatchMedia();
    }
  });

  test('renders no video panel when the game has no video URL', async () => {
    const restoreMatchMedia = stubMatchMedia(true);
    try {
      currentResponse = createResponse({
        game: {
          currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
          startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Court' })).toBeInTheDocument();
      });
      expect(screen.queryByText('Game Video')).not.toBeInTheDocument();
    } finally {
      restoreMatchMedia();
    }
  });

  test('clears the captured video timestamp when the layout mode changes to avoid a stale timestamp on remount', async () => {
    let changeListener = null;
    const mediaQueryList = {
      matches: true,
      media: '(min-width: 1024px)',
      onchange: null,
      addEventListener: (_event, listener) => {
        changeListener = listener;
      },
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = (query) =>
      query === '(min-width: 1024px)'
        ? mediaQueryList
        : {
            matches: false,
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
          };

    try {
      currentResponse = createResponse({
        game: {
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
          startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        },
      });

      renderPage();

      // Desktop video renders edge-to-edge (fill mode, no heading) — assert on the iframe.
      await waitFor(() => {
        expect(screen.getByTitle('Dev Scrimmage')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Fullscreen/i }));

      // Simulate the YouTube iframe reporting a playback position. The onMessage handler
      // only trusts messages whose source is the iframe's contentWindow, so set it here.
      const iframe = document.querySelector('iframe');
      fireEvent(
        window,
        new MessageEvent('message', {
          data: JSON.stringify({ event: 'infoDelivery', info: { currentTime: 42 } }),
          source: iframe?.contentWindow,
        })
      );

      // Simulate crossing the 1024px breakpoint (e.g. resizing/rotating), which remounts
      // the video in a new location per the two-column layout design. Wait for the mobile
      // "Track Stat" affordance to appear, confirming the layout actually flipped.
      mediaQueryList.matches = false;
      changeListener?.();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Track Stat/i })).toBeInTheDocument();
      });

      const court = getActiveCourt();
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
      // jsdom does not implement PointerEvent, so fireEvent.click cannot trigger the
      // court's onPointerDown handler here — use pointerDown directly (see other tests
      // in this file using fireEvent.click for the same purpose: those currently fail
      // in this environment for the same underlying jsdom limitation, tracked separately).
      fireEvent.pointerDown(court, { clientX: 250, clientY: 800 });

      await waitFor(() => {
        expect(screen.getAllByText(/Add Event/i).length).toBeGreaterThan(0);
      });

      // The picker backdrop briefly swallows clicks right after a pointerdown to guard
      // against synthetic "ghost click" events on touch devices (see ghostClickGuardRef
      // in GameTrackPage.jsx) — wait past that window before clicking a stat button.
      await new Promise((resolve) => setTimeout(resolve, 400));

      fireEvent.click(within(getEventPicker()).getByRole('button', { name: 'STL' }));

      await waitFor(() => {
        expect(apiMocks.appendEvent).toHaveBeenCalled();
      });
      const [, payload] = apiMocks.appendEvent.mock.calls[0];
      expect(payload.videoTimestamp).toBeUndefined();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  test('mobile video-first flow: Track Stat pauses and switches to entry view, logging a stat resumes and returns to video', async () => {
    const restoreMatchMedia = stubMatchMedia(false);
    try {
      currentResponse = createResponse({
        game: {
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
          startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        },
      });

      renderPage();

      // Watch view: Track Stat present; entry UI (court + Back-to-Video) not yet mounted.
      // The persistent video layer stays mounted across view changes (hidden, not unmounted)
      // so playback position is preserved — hence we assert on the entry UI's presence, and
      // on the video layer's `hidden` class (jsdom doesn't load Tailwind CSS, so toBeVisible
      // can't see class-based display:none; we check the class directly).
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Track Stat/i })).toBeInTheDocument();
      });
      const trackStatBtn = screen.getByRole('button', { name: /Track Stat/i });
      const videoLayer = trackStatBtn.parentElement;
      expect(videoLayer).not.toHaveClass('hidden');
      expect(screen.queryByRole('button', { name: /Back to Video/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId('interactive-court-image')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Track Stat/i }));

      // Entry mode: Back-to-Video + court now mounted/shown; the persistent video layer is
      // hidden (still mounted → playback preserved) rather than unmounted.
      expect(screen.getByRole('button', { name: /Back to Video/i })).toBeInTheDocument();
      expect(screen.getByTestId('interactive-court-image')).toBeInTheDocument();
      expect(videoLayer).toHaveClass('hidden');

      const court = getActiveCourt();
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
      fireEvent.pointerDown(court, { clientX: 250, clientY: 800 });

      await waitFor(() => {
        expect(screen.getAllByText(/Add Event/i).length).toBeGreaterThan(0);
      });

      await new Promise((resolve) => setTimeout(resolve, 400));
      fireEvent.click(within(getEventPicker()).getByRole('button', { name: 'STL' }));

      await waitFor(() => {
        expect(apiMocks.appendEvent).toHaveBeenCalled();
      });
      // Logging a stat returns to the watch view: the video layer is shown again (no longer
      // hidden) and the entry-mode UI (Back-to-Video / court) unmounts.
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Track Stat/i }).parentElement).not.toHaveClass(
          'hidden'
        );
      });
      expect(screen.queryByRole('button', { name: /Back to Video/i })).not.toBeInTheDocument();
    } finally {
      restoreMatchMedia();
    }
  });

  test('mobile video-first flow: cancelling the event picker stays in entry mode', async () => {
    const restoreMatchMedia = stubMatchMedia(false);
    try {
      currentResponse = createResponse({
        game: {
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
          startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Track Stat/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /Track Stat/i }));

      const court = getActiveCourt();
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
      fireEvent.pointerDown(court, { clientX: 250, clientY: 800 });

      await waitFor(() => {
        expect(screen.getAllByText(/Add Event/i).length).toBeGreaterThan(0);
      });

      fireEvent.click(
        within(getEventPicker()).getByRole('button', { name: /Close event picker/i })
      );

      expect(screen.getByRole('button', { name: /Back to Video/i })).toBeInTheDocument();
      expect(screen.queryByText('Game Video')).not.toBeInTheDocument();
    } finally {
      restoreMatchMedia();
    }
  });

  test('mobile video-first flow: switching tabs away from Court and back resets to video-first view', async () => {
    const restoreMatchMedia = stubMatchMedia(false);
    try {
      currentResponse = createResponse({
        game: {
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
          startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Track Stat/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /Track Stat/i }));
      expect(screen.getByRole('button', { name: /Back to Video/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Subs' }));
      fireEvent.click(screen.getByRole('button', { name: 'Court' }));

      expect(screen.getByRole('button', { name: /Track Stat/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Back to Video/i })).not.toBeInTheDocument();
    } finally {
      restoreMatchMedia();
    }
  });

  test('toggling "Pause Video During Stat Entry" off in the More tab disables pause/resume', async () => {
    const restoreMatchMedia = stubMatchMedia(false);
    try {
      currentResponse = createResponse({
        game: {
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
          startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Track Stat/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'More' }));
      expect(screen.getByText(/On — video pauses/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Pause Video During Stat Entry/i }));
      expect(screen.getByText(/Off — video keeps playing/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Court' }));
      fireEvent.click(screen.getByRole('button', { name: /Track Stat/i }));

      const court = getActiveCourt();
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
      fireEvent.pointerDown(court, { clientX: 250, clientY: 800 });

      await waitFor(() => {
        expect(screen.getAllByText(/Add Event/i).length).toBeGreaterThan(0);
      });

      await new Promise((resolve) => setTimeout(resolve, 400));
      fireEvent.click(within(getEventPicker()).getByRole('button', { name: 'STL' }));

      await waitFor(() => {
        expect(apiMocks.appendEvent).toHaveBeenCalled();
      });
      // View still switches manually via Track Stat/Back to Video regardless of the
      // pause preference — only the pause/resume postMessage calls are suppressed.
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Track Stat/i })).toBeInTheDocument();
      });
    } finally {
      restoreMatchMedia();
    }
  });

  test('adds a video URL from the More tab and reflects it in the video panel', async () => {
    const restoreMatchMedia = stubMatchMedia(true);
    try {
      currentResponse = createResponse({
        game: {
          currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
          startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: 'More' }));

      expect(screen.getByText('Add Video')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Add Video/i }));

      const input = screen.getByPlaceholderText('https://www.youtube.com/watch?v=...');
      fireEvent.change(input, {
        target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(apiMocks.update).toHaveBeenCalledWith('game-1', {
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Update Video')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Court' }));
      expect(screen.getByTitle('Dev Scrimmage')).toBeInTheDocument();
    } finally {
      restoreMatchMedia();
    }
  });

  test('updating an existing video URL from the More tab shows "Update Video" and persists the change', async () => {
    const restoreMatchMedia = stubMatchMedia(true);
    try {
      currentResponse = createResponse({
        game: {
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
          startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: 'More' }));

      expect(screen.getByText('Update Video')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Update Video/i }));

      const input = screen.getByPlaceholderText('https://www.youtube.com/watch?v=...');
      expect(input.value).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

      fireEvent.change(input, {
        target: { value: 'https://www.youtube.com/watch?v=abcdefghijk' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(apiMocks.update).toHaveBeenCalledWith('game-1', {
          videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
        });
      });
    } finally {
      restoreMatchMedia();
    }
  });

  test('clearing the video URL in the More tab sends null (not empty string) so the server can detach it', async () => {
    const restoreMatchMedia = stubMatchMedia(true);
    try {
      currentResponse = createResponse({
        game: {
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
          startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: 'More' }));
      fireEvent.click(screen.getByRole('button', { name: /Update Video/i }));

      const input = screen.getByPlaceholderText('https://www.youtube.com/watch?v=...');
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(apiMocks.update).toHaveBeenCalledWith('game-1', { videoUrl: null });
      });
    } finally {
      restoreMatchMedia();
    }
  });

  test('mobile entry mode exposes bench players (not just on-court) for stat attribution', async () => {
    const restoreMatchMedia = stubMatchMedia(false);
    try {
      currentResponse = createResponse({
        game: {
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
          startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Track Stat/i })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /Track Stat/i }));

      // player-6 (Flynn) is on the roster but not in the starting five → bench.
      expect(screen.getByText(/Bench \(1\)/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: playerButtonName('Flynn') })).toBeInTheDocument();
    } finally {
      restoreMatchMedia();
    }
  });

  test('toggling "Pause Video During Stat Entry" off resumes the video (no stranded pause)', async () => {
    // Use desktop layout: the video lives in the persistent left column, mounted across all
    // tabs, so it's still present (and controllable) when the More-tab toggle is flipped.
    const restoreMatchMedia = stubMatchMedia(true);
    try {
      currentResponse = createResponse({
        game: {
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
          startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTitle('Dev Scrimmage')).toBeInTheDocument();
      });

      // Spy on the iframe's postMessage so we can see the resume ("playVideo") command.
      const iframe = document.querySelector('iframe');
      const postMessageSpy = vi.fn();
      Object.defineProperty(iframe, 'contentWindow', {
        configurable: true,
        value: { postMessage: postMessageSpy },
      });

      fireEvent.click(screen.getByRole('button', { name: 'More' }));
      fireEvent.click(screen.getByRole('button', { name: /Pause Video During Stat Entry/i }));

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.stringContaining('playVideo'),
        expect.anything()
      );
    } finally {
      restoreMatchMedia();
    }
  });
});
