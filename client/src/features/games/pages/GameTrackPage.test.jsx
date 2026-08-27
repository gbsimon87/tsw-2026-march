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
  updateClock: vi.fn(),
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
        <Route path="/admin" element={<div>Admin destination</div>} />
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

function pointerDown(element, coordinates = {}) {
  fireEvent(element, new MouseEvent('pointerdown', { bubbles: true, ...coordinates }));
}

async function waitForEventPicker() {
  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: /Close event picker/i }).length).toBeGreaterThan(
      0
    );
  });
}

async function selectPickerPlayer(playerName) {
  const button = within(getEventPicker()).getByRole('button', {
    name: playerButtonName(playerName),
  });
  fireEvent.click(button);
  await waitFor(() => expect(button).toHaveClass('bg-slate-900'));
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
    apiMocks.updateClock.mockReset();
    sessionStorage.clear();

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

  test('does not show clock recovery immediately after starting the game', async () => {
    const playerIds = ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'];
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: playerIds,
        currentLineupPlayerIds: playerIds,
        gameFormat: {
          regulationSegmentType: 'quarter',
          regulationSegmentDurationSeconds: 600,
          overtimeDurationSeconds: 300,
        },
        clock: {
          status: 'ready',
          segmentKind: 'regulation',
          segmentNumber: 1,
          remainingMilliseconds: 600000,
          runningSince: null,
        },
      },
    });
    apiMocks.updateClock.mockImplementation(async (gameId, command) => {
      expect(command).toEqual({ action: 'start' });
      currentResponse = {
        ...currentResponse,
        game: {
          ...currentResponse.game,
          clock: {
            ...currentResponse.game.clock,
            status: 'running',
            runningSince: new Date().toISOString(),
          },
        },
      };
      return currentResponse;
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Start game' }));

    await waitFor(() => expect(apiMocks.updateClock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('The game clock kept running')).not.toBeInTheDocument();
  });

  test('still shows recovery when the page initially loads a running clock', async () => {
    const playerIds = ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'];
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: playerIds,
        currentLineupPlayerIds: playerIds,
        gameFormat: {
          regulationSegmentType: 'quarter',
          regulationSegmentDurationSeconds: 600,
          overtimeDurationSeconds: 300,
        },
        clock: {
          status: 'running',
          segmentKind: 'regulation',
          segmentNumber: 1,
          remainingMilliseconds: 600000,
          runningSince: new Date().toISOString(),
        },
      },
    });

    renderPage();

    expect(await screen.findByText('The game clock kept running')).toBeInTheDocument();
  });

  test('corrects a recovered clock through the reusable modal', async () => {
    const playerIds = ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'];
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: playerIds,
        currentLineupPlayerIds: playerIds,
        gameFormat: {
          regulationSegmentType: 'quarter',
          regulationSegmentDurationSeconds: 600,
          overtimeDurationSeconds: 300,
        },
        clock: {
          status: 'running',
          segmentKind: 'regulation',
          segmentNumber: 1,
          remainingMilliseconds: 600000,
          runningSince: new Date().toISOString(),
        },
      },
    });
    apiMocks.updateClock.mockResolvedValue(currentResponse);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Correct time' }));
    fireEvent.change(screen.getByLabelText('Corrected time'), { target: { value: '4:32.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply corrected time' }));

    await waitFor(() =>
      expect(apiMocks.updateClock).toHaveBeenCalledWith('game-1', {
        action: 'correct',
        segmentKind: 'regulation',
        segmentNumber: 1,
        remainingMilliseconds: 272500,
      })
    );
  });

  test('uses a reusable modal before pausing a running clock and exiting', async () => {
    const playerIds = ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'];
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: playerIds,
        currentLineupPlayerIds: playerIds,
        gameFormat: {
          regulationSegmentType: 'quarter',
          regulationSegmentDurationSeconds: 600,
          overtimeDurationSeconds: 300,
        },
        clock: {
          status: 'running',
          segmentKind: 'regulation',
          segmentNumber: 1,
          remainingMilliseconds: 600000,
          runningSince: new Date().toISOString(),
        },
      },
    });
    apiMocks.updateClock.mockResolvedValue(currentResponse);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept elapsed time' }));
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByText('Save & Exit'));

    expect(screen.getByRole('dialog', { name: 'Pause the clock and exit?' })).toBeInTheDocument();
    expect(apiMocks.updateClock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Pause and exit' }));

    await waitFor(() =>
      expect(apiMocks.updateClock).toHaveBeenCalledWith('game-1', { action: 'pause' })
    );
    expect(await screen.findByText('Admin destination')).toBeInTheDocument();
  });

  test('shows lineup setup before any tracking controls for a new one-sided game', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Set TSW Team Starting Lineup/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /Fullscreen/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Court' })).not.toBeInTheDocument();
  });

  test('inserts a quick stat before a selected recent event', async () => {
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
      fireEvent.click(screen.getByRole('button', { name: 'Events' }));
      expect(screen.getByText(/Recent Events/i)).toBeInTheDocument();
    });

    const insertButtons = screen.getAllByRole('button', {
      name: 'Insert stat before this event',
    });
    fireEvent.click(insertButtons[1]);
    pointerDown(getActiveCourt(), { clientX: 250, clientY: 800 });
    await waitForEventPicker();
    await selectPickerPlayer('Alex');
    fireEvent.click(within(getEventPicker()).getByRole('button', { name: 'STL' }));

    await waitFor(() => {
      expect(apiMocks.insertEventBefore).toHaveBeenCalledWith(
        'game-1',
        'event-2',
        expect.objectContaining({ playerId: 'player-1', statType: 'STL' })
      );
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
    expect(screen.queryByText('Starting Lineup')).not.toBeInTheDocument();
  });

  test('does not render the game title above the score header', async () => {
    const playerIds = ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'];
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: playerIds,
        currentLineupPlayerIds: playerIds,
      },
    });

    renderPage();

    expect(await screen.findByRole('button', { name: 'Court' })).toBeInTheDocument();
    expect(screen.queryByText('Dev Scrimmage')).not.toBeInTheDocument();
    expect(screen.getByText('Opponent')).toHaveClass('text-right');
    expect(screen.getByText('Opponent').nextElementSibling).toHaveClass('text-right');
  });

  test('does not reopen first-time lineup setup after a starting lineup was saved', async () => {
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: ['player-1'],
        currentLineupPlayerIds: [],
      },
    });

    renderPage();

    expect(await screen.findByRole('button', { name: 'Court' })).toBeInTheDocument();
    expect(screen.queryByText(/Set TSW Team Starting Lineup/i)).not.toBeInTheDocument();
  });

  test('waits for the entry clock pause before saving a quickly tapped free throw', async () => {
    const playerIds = ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'];
    let pauseResolved = false;
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: playerIds,
        currentLineupPlayerIds: playerIds,
        gameFormat: {
          regulationSegmentType: 'quarter',
          regulationSegmentDurationSeconds: 600,
          overtimeDurationSeconds: 300,
        },
        clock: {
          status: 'running',
          segmentKind: 'regulation',
          segmentNumber: 1,
          remainingMilliseconds: 600000,
          runningSince: new Date().toISOString(),
        },
      },
    });
    apiMocks.updateClock.mockImplementation(async (gameId, command) => {
      if (command.action === 'pause') {
        await new Promise((resolve) => setTimeout(resolve, 30));
        pauseResolved = true;
        currentResponse = {
          ...currentResponse,
          game: {
            ...currentResponse.game,
            clock: {
              ...currentResponse.game.clock,
              status: 'paused',
              runningSince: null,
            },
          },
        };
      }

      return currentResponse;
    });
    apiMocks.appendEvent.mockImplementation((gameId, payload) => {
      expect(pauseResolved).toBe(true);
      currentResponse = {
        ...currentResponse,
        game: {
          ...currentResponse.game,
          events: [
            ...currentResponse.game.events,
            {
              id: 'event-1',
              ...payload,
            },
          ],
        },
      };
      return Promise.resolve({
        game: currentResponse.game,
        boxScore: currentResponse.boxScore,
        gameSummary: currentResponse.gameSummary,
      });
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept elapsed time' }));
    pointerDown(getActiveCourt(), { clientX: 250, clientY: 800 });
    await waitForEventPicker();
    await selectPickerPlayer('Alex');
    const freeThrowButton = within(getEventPicker()).getByRole('button', { name: 'FT+' });
    expect(freeThrowButton).toBeEnabled();
    fireEvent.click(freeThrowButton);

    expect(apiMocks.appendEvent).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(apiMocks.appendEvent).toHaveBeenCalledWith(
        'game-1',
        expect.objectContaining({ playerId: 'player-1', statType: 'FT_MADE' })
      );
    });
  });

  test('blocks new events until the game clock has started', async () => {
    const playerIds = ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'];
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: playerIds,
        currentLineupPlayerIds: playerIds,
        gameFormat: {
          regulationSegmentType: 'quarter',
          regulationSegmentDurationSeconds: 600,
          overtimeDurationSeconds: 300,
        },
        clock: {
          status: 'ready',
          segmentKind: 'regulation',
          segmentNumber: 1,
          remainingMilliseconds: 600000,
          runningSince: null,
        },
      },
    });

    renderPage();
    pointerDown(await screen.findByTestId('interactive-court-image'), {
      clientX: 250,
      clientY: 800,
    });

    expect(screen.getByText(/start the game clock before recording an event/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /close event picker/i })).not.toBeInTheDocument();
    expect(apiMocks.appendEvent).not.toHaveBeenCalled();
  });

  test('warns before starting a game with a short lineup and allows continuing', async () => {
    currentResponse = createResponse({
      game: {
        status: 'scheduled',
        gameFormat: {
          regulationSegmentType: 'quarter',
          regulationSegmentDurationSeconds: 600,
          overtimeDurationSeconds: 300,
        },
        clock: {
          status: 'ready',
          segmentKind: 'regulation',
          segmentNumber: 1,
          remainingMilliseconds: 600000,
          runningSince: null,
        },
      },
    });
    apiMocks.updateClock.mockResolvedValue(currentResponse);

    renderPage();
    fireEvent.click(await screen.findByLabelText('Alex'));
    fireEvent.click(screen.getByLabelText('Blake'));
    fireEvent.click(screen.getByLabelText('Casey'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Lineup' }));

    await waitFor(() => expect(apiMocks.setLineup).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }));

    expect(
      screen.getByRole('dialog', { name: 'Start with fewer than five players?' })
    ).toBeInTheDocument();
    expect(apiMocks.updateClock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue and start' }));
    await waitFor(() =>
      expect(apiMocks.updateClock).toHaveBeenCalledWith('game-1', { action: 'start' })
    );
  });

  test('returns to lineup editing from the short-lineup warning', async () => {
    currentResponse = createResponse({
      game: {
        status: 'scheduled',
        startingLineupPlayerIds: ['player-1'],
        currentLineupPlayerIds: ['player-1'],
        gameFormat: {
          regulationSegmentType: 'quarter',
          regulationSegmentDurationSeconds: 600,
          overtimeDurationSeconds: 300,
        },
        clock: {
          status: 'ready',
          segmentKind: 'regulation',
          segmentNumber: 1,
          remainingMilliseconds: 600000,
          runningSince: null,
        },
      },
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Start game' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go back to lineup' }));

    expect(screen.queryByText('Start with fewer than five players?')).not.toBeInTheDocument();
    expect(screen.getByText('Starting Lineup')).toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: 'Select Home Squad' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Fullscreen/i }));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Away Squad' }).length).toBeGreaterThan(0);
    });

    pointerDown(getActiveCourt());

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

  test('centres the clock from tablet width and right-aligns the away score block', async () => {
    currentResponse = createLeagueDualTeamResponse({ homeReady: true, awayReady: true });
    currentResponse.game = {
      ...currentResponse.game,
      gameFormat: {
        regulationSegmentType: 'quarter',
        regulationSegmentDurationSeconds: 600,
        overtimeDurationSeconds: 300,
      },
      clock: {
        status: 'ready',
        segmentKind: 'regulation',
        segmentNumber: 1,
        remainingMilliseconds: 600000,
        runningSince: null,
      },
    };
    apiMocks.getById.mockResolvedValue(currentResponse);

    renderPage();

    const awayButton = await screen.findByRole('button', { name: 'Select Away Squad' });
    expect(awayButton).toHaveClass('md:col-start-3', 'text-right');
    expect(within(awayButton).getByText('0')).toHaveClass('text-right');

    const clockContainer = screen.getByLabelText('Game clock').closest('section').parentElement;
    expect(clockContainer).toHaveClass('md:col-start-2', 'md:row-start-1');
    expect(screen.getByTestId('game-track-score-header')).toHaveClass(
      'md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]'
    );
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

    pointerDown(court, { clientX: 475, clientY: 900 });
    await waitForEventPicker();
    await selectPickerPlayer('Alex');
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
      within(overlay).queryByRole('button', { name: playerButtonName('Alex') })
    ).not.toBeInTheDocument();
    expect(
      within(overlay).getByRole('button', { name: playerButtonName('Blake') })
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

    pointerDown(court, { clientX: 250, clientY: 800 });
    await waitForEventPicker();
    await selectPickerPlayer('Alex');
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

    expect(apiMocks.appendEvent.mock.calls[1][1]).toEqual(
      expect.objectContaining({ statType: 'OPP_REB' })
    );
  });

  test('records court quick stats and opponent scoring', async () => {
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

    pointerDown(court, { clientX: 250, clientY: 800 });
    await waitForEventPicker();
    await selectPickerPlayer('Alex');
    fireEvent.click(within(getEventPicker()).getByRole('button', { name: 'STL' }));

    await waitFor(() => {
      expect(apiMocks.appendEvent).toHaveBeenCalledWith(
        'game-1',
        expect.objectContaining({ playerId: 'player-1', statType: 'STL' })
      );
      expect(screen.queryByRole('button', { name: /Close event picker/i })).not.toBeInTheDocument();
    });

    const updatedCourt = getActiveCourt();
    updatedCourt.getBoundingClientRect = court.getBoundingClientRect;
    pointerDown(updatedCourt, { clientX: 250, clientY: 800 });
    await waitForEventPicker();
    await selectPickerPlayer('Alex');
    fireEvent.click(within(getEventPicker()).getByRole('button', { name: '+2' }));

    await waitFor(() => {
      expect(apiMocks.appendEvent).toHaveBeenCalledWith(
        'game-1',
        expect.objectContaining({ statType: 'OPP_FG2_MADE' })
      );
    });

    const quickStatPayload = apiMocks.appendEvent.mock.calls[0][1];
    expect(quickStatPayload).toEqual(expect.objectContaining({ x: 50, y: 85.11, zoneId: 'PAINT' }));
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

    fireEvent.click(screen.getByRole('button', { name: 'Subs' }));
    fireEvent.click(getLastButtonByName('Alex'));
    fireEvent.click(getLastButtonByName('Flynn'));
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
    expect(screen.getByText(/On Bench/i)).toBeInTheDocument();
  });

  test('renders the score and tracking quick actions without the extra stats strip', async () => {
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

    pointerDown(court, { clientX: 250, clientY: 800 });
    await waitForEventPicker();

    const overlay = getEventPicker();
    expect(within(overlay).getByRole('button', { name: 'STL' })).toBeInTheDocument();
    expect(within(overlay).getByRole('button', { name: 'TOV' })).toBeInTheDocument();
    expect(within(overlay).getByRole('button', { name: 'FOUL' })).toBeInTheDocument();
    expect(within(overlay).getByRole('button', { name: 'DREB' })).toBeInTheDocument();
    expect(screen.queryByText('66.7%')).not.toBeInTheDocument();
    expect(screen.queryByText('50.0%')).not.toBeInTheDocument();
    expect(screen.getAllByText('24').length).toBeGreaterThan(0);
    expect(screen.getAllByText('18').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Opponent').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('game-track-score-header')).toHaveLength(2);
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

  test('mobile video-first flow shows lineup setup before video and hides it after saving', async () => {
    const restoreMatchMedia = stubMatchMedia(false);
    try {
      currentResponse = createResponse({
        game: { videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      });

      renderPage();

      expect(await screen.findByText('Starting Lineup')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Track Stat/i })).not.toBeInTheDocument();
      fireEvent.click(screen.getByLabelText(/Select Alex for the starting lineup/i));
      fireEvent.click(screen.getByRole('button', { name: 'Save Lineup' }));

      expect(await screen.findByRole('button', { name: /Track Stat/i })).toBeInTheDocument();
      expect(screen.queryByText('Starting Lineup')).not.toBeInTheDocument();
    } finally {
      restoreMatchMedia();
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

describe('GameTrackPage empty league roster', () => {
  // Reproduces a schedule-built fixture: league, dual-team, scheduled, both
  // rosters empty, viewer allowed to manage the roster. The lineup step should
  // offer a way to add a player without leaving the tracker.
  function emptyLeagueResponse(overrides = {}) {
    return {
      game: {
        id: 'game-1',
        title: 'Dorset Storm Men I at Bournemouth Bears',
        gameContext: 'league',
        trackingMode: 'dual_team',
        status: 'scheduled',
        events: [],
        homeLeagueTeamId: 'lt-home',
        awayLeagueTeamId: 'lt-away',
        startingLineupPlayerIds: [],
        currentLineupPlayerIds: [],
        homeCurrentLineupPlayerIds: [],
        awayCurrentLineupPlayerIds: [],
      },
      team: { id: 'lt-home', name: 'Bournemouth Bears', players: [] },
      participants: {
        home: { displayName: 'Bournemouth Bears', slug: 'bournemouth-bears', players: [] },
        away: { displayName: 'Dorset Storm Men I', slug: 'dorset-storm-men-i', players: [] },
      },
      lineups: {
        home: { startingPlayerIds: [], currentPlayerIds: [] },
        away: { startingPlayerIds: [], currentPlayerIds: [] },
      },
      league: {
        id: 'l-1',
        slug: 'dorset-basketball-association',
        name: 'Dorset Basketball Association',
      },
      canManageRoster: true,
      boxScore: { home: { players: [], totals: {} }, away: { players: [], totals: {} } },
      gameSummary: { homePoints: 0, awayPoints: 0 },
      ...overrides,
    };
  }

  test('offers Add player when the roster is empty and the viewer can manage it', async () => {
    apiMocks.getById.mockResolvedValue(emptyLeagueResponse());

    renderPage();

    expect(await screen.findByText('No players found on this roster.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add player' })).toBeInTheDocument();
  });

  // Reaching this page for a league game already requires league owner, active
  // league manager, or manager of one of the two teams — the same set
  // canManageGameRoster allows. So the roster flag can only ever produce a false
  // negative here, stranding someone who is allowed to add players. Never send
  // them off to another page to do it.
  test('still offers Add player on a league game when the roster flag is false', async () => {
    apiMocks.getById.mockResolvedValue(emptyLeagueResponse({ canManageRoster: false }));

    renderPage();

    expect(await screen.findByText('No players found on this roster.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add player' })).toBeInTheDocument();
    // No detour to a public league page or an admin page.
    expect(screen.queryByRole('link', { name: /add players/i })).not.toBeInTheDocument();
  });

  test('a standalone game with no permission gets prose, not a button', async () => {
    apiMocks.getById.mockResolvedValue(
      emptyLeagueResponse({
        canManageRoster: false,
        game: {
          id: 'game-1',
          title: 'Scrimmage',
          gameContext: 'standalone',
          trackingMode: 'one_sided',
          status: 'scheduled',
          events: [],
          teamId: 'team-1',
          startingLineupPlayerIds: [],
          currentLineupPlayerIds: [],
        },
        participants: null,
        lineups: null,
      })
    );

    renderPage();

    expect(await screen.findByText('No players found on this roster.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add player' })).not.toBeInTheDocument();
  });
});

describe('GameTrackPage short lineup return path', () => {
  function shortLineupResponse() {
    return {
      game: {
        id: 'game-1',
        title: 'Dorset Storm Men I at Bournemouth Bears',
        gameContext: 'league',
        trackingMode: 'dual_team',
        status: 'scheduled',
        events: [],
        homeLeagueTeamId: 'lt-home',
        awayLeagueTeamId: 'lt-away',
        startingLineupPlayerIds: [],
        currentLineupPlayerIds: [],
        gameFormat: {
          regulationSegmentType: 'quarter',
          regulationSegmentDurationSeconds: 600,
          overtimeDurationSeconds: 300,
        },
        clock: {
          status: 'ready',
          segmentKind: 'regulation',
          segmentNumber: 1,
          remainingMilliseconds: 600000,
          runningSince: null,
        },
      },
      team: { id: 'lt-home', name: 'Bournemouth Bears', players: [] },
      participants: {
        home: {
          displayName: 'Bournemouth Bears',
          slug: 'bournemouth-bears',
          players: [{ id: 'h1', displayName: 'Marc', isActive: true }],
        },
        away: {
          displayName: 'Dorset Storm Men I',
          slug: 'dorset-storm-men-i',
          players: [{ id: 'a1', displayName: 'Sam', isActive: true }],
        },
      },
      lineups: {
        home: { startingPlayerIds: ['h1'], currentPlayerIds: ['h1'] },
        away: { startingPlayerIds: ['a1'], currentPlayerIds: ['a1'] },
      },
      league: { id: 'l-1', slug: 'dorset-basketball-association', name: 'Dorset BA' },
      canManageRoster: true,
      boxScore: { home: { players: [], totals: {} }, away: { players: [], totals: {} } },
      gameSummary: { homePoints: 0, awayPoints: 0 },
    };
  }

  // The modal offers "Go back to lineup"; it used to just switch to the court
  // tab, where the only way to add another player sits below the court image.
  // It must reopen the lineup step, where adding players is the point.
  test('Go back to lineup reopens the lineup step, not the court tab', async () => {
    apiMocks.getById.mockResolvedValue(shortLineupResponse());

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Start game' }));
    expect(await screen.findByText('Start with fewer than five players?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go back to lineup' }));

    // The lineup step replaces the tracking shell, so the court is not rendered.
    await waitFor(() => {
      expect(screen.queryByTestId('interactive-court-image')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '+ Add player' })).toBeInTheDocument();
    // Clock never started.
    expect(apiMocks.updateClock).not.toHaveBeenCalled();
  });

  // The reopened step has only Save Lineup and Add player, so without an exit a
  // user who changed their mind is stuck in it until they save something.
  test('the reopened lineup step can be left without saving', async () => {
    apiMocks.getById.mockResolvedValue(shortLineupResponse());

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Start game' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Go back to lineup' }));
    await waitFor(() => {
      expect(screen.queryByTestId('interactive-court-image')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Back to game' }));

    await waitFor(() => {
      expect(screen.getAllByTestId('interactive-court-image').length).toBeGreaterThan(0);
    });
    expect(apiMocks.setLineup).not.toHaveBeenCalled();
  });
});
