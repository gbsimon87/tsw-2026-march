import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GameTrackPage } from './GameTrackPage';

class MockSpeechRecognition {
  static instances = [];

  constructor() {
    MockSpeechRecognition.instances.push(this);
    this.start = vi.fn();
    this.abort = vi.fn();
  }

  emitStart() {
    this.onstart?.();
  }

  emitResult(transcript) {
    const result = [{ transcript }];
    result.isFinal = true;
    this.onresult?.({ resultIndex: 0, results: [result] });
  }

  emitError(error = 'network') {
    this.onerror?.({ error });
  }
}

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
      sport: 'basketball',
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

async function enableVoiceTracking() {
  fireEvent.click(await screen.findByRole('button', { name: 'More' }));
  const toggle = screen.getByRole('button', { name: /Voice Tracking/ });
  fireEvent.click(toggle);
  expect(MockSpeechRecognition.instances).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Court' }));
  const guidance = await screen.findAllByText(
    'Voice tracking is on. Select a court position to start listening.'
  );
  return guidance[0];
}

function installSpeechRecognition() {
  MockSpeechRecognition.instances = [];
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  window.SpeechRecognition = MockSpeechRecognition;
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

function tapCourtAt(clientX, clientY) {
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
  pointerDown(court, { clientX, clientY });
}

async function startCourtVoice(clientX, clientY) {
  const previousCount = MockSpeechRecognition.instances.length;
  tapCourtAt(clientX, clientY);
  await waitFor(() => expect(MockSpeechRecognition.instances).toHaveLength(previousCount + 1));
  const recognition = MockSpeechRecognition.instances.at(-1);
  act(() => recognition.emitStart());
  return recognition;
}

async function speakFromCourt(transcript, clientX = 475, clientY = 900) {
  const recognition = await startCourtVoice(clientX, clientY);
  act(() => recognition.emitResult(transcript));
  return recognition;
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

// One microphone cycle: tap, recognition starts, one final transcript arrives.
async function speak(transcript) {
  const availableMicrophone = screen.queryByRole('button', { name: 'Record voice command' });
  if (!availableMicrophone) return speakFromCourt(transcript, 250, 800);

  const previousCount = MockSpeechRecognition.instances.length;
  const microphone = availableMicrophone;
  await waitFor(() => expect(microphone).not.toBeDisabled());
  fireEvent.click(microphone);
  await waitFor(() => expect(MockSpeechRecognition.instances).toHaveLength(previousCount + 1));
  const recognition = MockSpeechRecognition.instances.at(-1);
  act(() => recognition.emitStart());
  act(() => recognition.emitResult(transcript));
  return recognition;
}

async function startListening() {
  const availableMicrophone = screen.queryByRole('button', { name: 'Record voice command' });
  if (!availableMicrophone) return startCourtVoice(250, 800);

  const previousCount = MockSpeechRecognition.instances.length;
  const microphone = availableMicrophone;
  await waitFor(() => expect(microphone).not.toBeDisabled());
  fireEvent.click(microphone);
  await waitFor(() => expect(MockSpeechRecognition.instances).toHaveLength(previousCount + 1));
  const recognition = MockSpeechRecognition.instances.at(-1);
  act(() => recognition.emitStart());
  return recognition;
}

async function expectVoiceMessage(message) {
  await waitFor(() => expect(screen.getAllByText(message).length).toBeGreaterThan(0));
}

describe('GameTrackPage', () => {
  let currentResponse;

  afterEach(() => {
    cleanup();
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    delete window.isSecureContext;
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

  test('enables voice from More without starting the microphone', async () => {
    installSpeechRecognition();
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: ['player-1'],
        currentLineupPlayerIds: ['player-1'],
      },
    });

    renderPage();
    await enableVoiceTracking();

    expect(screen.queryByRole('button', { name: 'Record voice command' })).not.toBeInTheDocument();
    expect(MockSpeechRecognition.instances).toHaveLength(0);
  });

  test('explains the voice process and complete phrase sets for a one-team game', async () => {
    installSpeechRecognition();
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: ['player-1'],
        currentLineupPlayerIds: ['player-1'],
      },
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'More' }));
    const voiceSection = screen.getByRole('heading', { name: 'Voice tracking' }).closest('section');
    expect(
      within(voiceSection).getByRole('button', { name: /Voice Tracking/ })
    ).toBeInTheDocument();
    expect(
      within(voiceSection).getByRole('button', { name: 'How to use voice commands' })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tracking setup' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Game actions' })).toBeInTheDocument();

    fireEvent.click(
      within(voiceSection).getByRole('button', { name: 'How to use voice commands' })
    );

    const dialog = screen.getByRole('dialog', { name: 'How to use voice tracking' });
    expect(within(dialog).getByText('Track a stat')).toBeInTheDocument();
    expect(within(dialog).getByText('player + action')).toBeInTheDocument();
    expect(within(dialog).getByText('home/away + player + action')).toBeInTheDocument();
    expect(within(dialog).getByText('Use one-team phrases')).toBeInTheDocument();
    expect(within(dialog).getByText(/do not say home or away/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/use Subs to sub them in first/i)).toBeInTheDocument();

    const shots = within(dialog).getByRole('table', { name: 'Shots' });
    expect(within(shots).getByText('13 3pt field goal missed')).toBeInTheDocument();
    expect(within(shots).getByText('Alex missed free throw')).toBeInTheDocument();

    const nonShots = within(dialog).getByRole('table', { name: 'Non-shot stats' });
    expect(within(nonShots).getByText('13 offensive rebound')).toBeInTheDocument();
    expect(within(nonShots).getByText('Alex Morgan foul')).toBeInTheDocument();

    const dualTeam = within(dialog).getByRole('table', { name: 'Dual-team tracking' });
    expect(within(dualTeam).getByText('home number 13 steal')).toBeInTheDocument();
    expect(within(dualTeam).getByText('away twenty three turnover')).toBeInTheDocument();

    const followUps = within(dialog).getByRole('table', {
      name: 'Follow-ups and controls',
    });
    expect(within(followUps).getByText('unassisted')).toBeInTheDocument();
    expect(within(followUps).getByText('Cancel listening button')).toBeInTheDocument();

    const refusals = within(dialog).getByRole('table', { name: 'Expected refusals' });
    expect(within(refusals).getByText('21 jump shot made')).toBeInTheDocument();
    expect(within(refusals).getByText('13 made two three')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'How to use voice tracking' })
      ).not.toBeInTheDocument()
    );
  });

  test('identifies the required primary-command format for a dual-team game', async () => {
    installSpeechRecognition();
    currentResponse = createLeagueDualTeamResponse({ homeReady: true, awayReady: true });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'How to use voice commands' }));

    const dialog = screen.getByRole('dialog', { name: 'How to use voice tracking' });
    expect(within(dialog).getByText('Use dual-team phrases')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/start every primary command with home or away/i)
    ).toBeInTheDocument();
    expect(
      within(within(dialog).getByRole('table', { name: 'Dual-team tracking' })).getByText(
        'away 7 3pt field goal missed'
      )
    ).toBeInTheDocument();
  });

  test('records a one-sided non-shot command with the recognition-start clock snapshot', async () => {
    installSpeechRecognition();
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: ['player-1'],
        currentLineupPlayerIds: ['player-1'],
        gameFormat: {
          regulationSegmentType: 'quarter',
          regulationSegmentDurationSeconds: 600,
          overtimeDurationSeconds: 300,
        },
        clock: {
          status: 'paused',
          segmentKind: 'regulation',
          segmentNumber: 2,
          remainingMilliseconds: 321000,
          runningSince: null,
        },
      },
    });

    renderPage();
    await enableVoiceTracking();
    await speakFromCourt('Alex steal', 250, 800);

    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
    expect(apiMocks.appendEvent).toHaveBeenCalledWith(
      'game-1',
      expect.objectContaining({
        playerId: 'player-1',
        statType: 'STL',
        segmentKind: 'regulation',
        segmentNumber: 2,
        clockMillisecondsRemaining: 321000,
      })
    );
    expect(screen.getAllByText('Alex: Steal recorded.').length).toBeGreaterThan(0);
  });

  test.each([
    ['Alex two point field goal made', 74.45, 470, 'FG2_MADE'],
    ['Alex 2pt field goal missed', 74.45, 470, 'FG2_MISS'],
    ['Alex three point field goal made', 475, 900, 'FG3_MADE'],
    ['Alex 3pt field goal missed', 475, 900, 'FG3_MISS'],
    ['Alex free throw made', 250, 800, 'FT_MADE'],
    ['Alex free throw missed', 250, 800, 'FT_MISS'],
    ['Alex offensive rebound', 250, 800, 'OREB'],
    ['Alex defensive rebound', 250, 800, 'DREB'],
    ['Alex steal', 250, 800, 'STL'],
    ['Alex block', 250, 800, 'BLK'],
    ['Alex turnover', 250, 800, 'TOV'],
    ['Alex foul', 250, 800, 'FOUL'],
  ])('connects the voice action %s to %s', async (transcript, x, y, statType) => {
    installSpeechRecognition();
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: ['player-1'],
        currentLineupPlayerIds: ['player-1'],
      },
    });

    renderPage();
    await enableVoiceTracking();
    await speakFromCourt(transcript, x, y);

    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
    expect(apiMocks.appendEvent.mock.calls[0][1]).toEqual(
      expect.objectContaining({ playerId: 'player-1', statType })
    );
  });

  test('captures the video timestamp when voice recognition starts', async () => {
    const restoreMatchMedia = stubMatchMedia(true);
    try {
      installSpeechRecognition();
      currentResponse = createResponse({
        game: {
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          startingLineupPlayerIds: ['player-1'],
          currentLineupPlayerIds: ['player-1'],
        },
      });

      renderPage();
      const iframe = await screen.findByTitle('Dev Scrimmage');
      fireEvent(
        window,
        new MessageEvent('message', {
          data: JSON.stringify({ event: 'infoDelivery', info: { currentTime: 27.6 } }),
          source: iframe.contentWindow,
        })
      );

      await enableVoiceTracking();
      await speakFromCourt('Alex turnover', 250, 800);

      await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
      expect(apiMocks.appendEvent.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          playerId: 'player-1',
          statType: 'TOV',
          videoTimestamp: 28,
        })
      );
    } finally {
      restoreMatchMedia();
    }
  });

  test('uses a court tap to start a shot command and falls back to the picker on rejection', async () => {
    installSpeechRecognition();
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: ['player-1'],
        currentLineupPlayerIds: ['player-1'],
      },
    });

    renderPage();
    await enableVoiceTracking();

    const recognition = await startCourtVoice(475, 900);
    expect(screen.queryByRole('button', { name: /Close event picker/i })).not.toBeInTheDocument();
    act(() => recognition.emitResult('Alex made two'));
    await waitFor(() =>
      expect(
        screen.getByText('The spoken point value does not match the court location.')
      ).toBeInTheDocument()
    );
    expect(apiMocks.appendEvent).not.toHaveBeenCalled();
    await waitForEventPicker();
    expect(
      within(getEventPicker()).queryByRole('button', { name: 'Record voice command' })
    ).not.toBeInTheDocument();
    expect(within(getEventPicker()).getByText(/Corner Right 3 • FG3/i)).toBeInTheDocument();

    await selectPickerPlayer('Alex');
    fireEvent.click(within(getEventPicker()).getByRole('button', { name: 'Make' }));
    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
    expect(apiMocks.appendEvent.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        playerId: 'player-1',
        statType: 'FG3_MADE',
        zoneId: 'CORNER_RIGHT_3',
        x: 95.74,
        y: 5,
        courtLayoutId: 'legacy-v1',
      })
    );
  });

  test('opens the picker with the tapped location retained when court-triggered speech fails', async () => {
    installSpeechRecognition();
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: ['player-1'],
        currentLineupPlayerIds: ['player-1'],
      },
    });

    renderPage();
    await enableVoiceTracking();
    const recognition = await startCourtVoice(475, 900);

    expect(screen.queryByRole('button', { name: /Close event picker/i })).not.toBeInTheDocument();
    expect(recognition.abort).not.toHaveBeenCalled();
    act(() => recognition.emitError('no-speech'));

    await waitForEventPicker();
    expect(within(getEventPicker()).getByText(/Corner Right 3 • FG3/i)).toBeInTheDocument();
    expect(
      within(getEventPicker()).queryByRole('button', { name: 'Record voice command' })
    ).not.toBeInTheDocument();
    expect(apiMocks.appendEvent).not.toHaveBeenCalled();
  });

  test('retains the court tap when microphone permission fails before recognition starts', async () => {
    installSpeechRecognition();
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: ['player-1'],
        currentLineupPlayerIds: ['player-1'],
      },
    });

    renderPage();
    await enableVoiceTracking();
    const previousCount = MockSpeechRecognition.instances.length;
    tapCourtAt(475, 900);
    await waitFor(() => expect(MockSpeechRecognition.instances).toHaveLength(previousCount + 1));
    act(() => MockSpeechRecognition.instances.at(-1).emitError('not-allowed'));

    await waitForEventPicker();
    expect(within(getEventPicker()).getByText(/Corner Right 3 • FG3/i)).toBeInTheDocument();
    expect(apiMocks.appendEvent).not.toHaveBeenCalled();
  });

  test('attributes a dual-team voice command to its explicit spoken side', async () => {
    installSpeechRecognition();
    currentResponse = createLeagueDualTeamResponse({ homeReady: true, awayReady: true });
    apiMocks.getById.mockResolvedValue(currentResponse);

    renderPage();
    await enableVoiceTracking();
    await speakFromCourt('away Away 1 steal', 250, 800);

    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
    expect(apiMocks.appendEvent.mock.calls[0][1]).toEqual(
      expect.objectContaining({ playerId: 'away-1', statType: 'STL', teamSide: 'away' })
    );
  });

  test('shows an unavailable More option when browser speech recognition is unsupported', async () => {
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: ['player-1'],
        currentLineupPlayerIds: ['player-1'],
      },
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'More' }));
    const toggle = screen.getByRole('button', { name: /Voice Tracking/ });
    expect(toggle).toBeDisabled();
    expect(screen.getByText('Not supported by this browser.')).toBeInTheDocument();
  });

  test('opens the existing assist follow-up after a made field goal recorded by voice', async () => {
    installSpeechRecognition();
    const playerIds = ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'];
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: playerIds,
        currentLineupPlayerIds: playerIds,
      },
    });

    renderPage();
    await enableVoiceTracking();
    await speakFromCourt('Alex made');

    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
    expect(apiMocks.appendEvent.mock.calls[0][1]).toEqual(
      expect.objectContaining({ playerId: 'player-1', statType: 'FG3_MADE' })
    );

    const overlay = getEventPicker();
    expect(within(overlay).getByText(/Who assisted\?/i)).toBeInTheDocument();
    expect(
      within(overlay).queryByRole('button', { name: playerButtonName('Alex') })
    ).not.toBeInTheDocument();
    expect(within(overlay).getByRole('button', { name: /Unassisted/i })).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Record voice command' })).toBeInTheDocument()
    );
    const assistButton = within(getEventPicker()).getByRole('button', {
      name: playerButtonName('Blake'),
    });
    fireEvent.click(assistButton);

    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(2));
    expect(apiMocks.appendEvent.mock.calls[1][1]).toEqual(
      expect.objectContaining({ playerId: 'player-2', statType: 'AST' })
    );
  });

  test('sends an identical append payload for a voice command and its equivalent button', async () => {
    installSpeechRecognition();
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
          status: 'paused',
          segmentKind: 'regulation',
          segmentNumber: 3,
          remainingMilliseconds: 275000,
          runningSince: null,
        },
      },
    });

    renderPage();
    await screen.findByTestId('interactive-court-image');
    tapCourtAt(250, 800);
    await waitForEventPicker();
    await selectPickerPlayer('Alex');
    fireEvent.click(within(getEventPicker()).getByRole('button', { name: 'STL' }));

    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
    const buttonPayload = apiMocks.appendEvent.mock.calls[0][1];
    expect(buttonPayload).toEqual(
      expect.objectContaining({
        playerId: 'player-1',
        statType: 'STL',
        segmentKind: 'regulation',
        segmentNumber: 3,
        clockMillisecondsRemaining: 275000,
      })
    );

    apiMocks.appendEvent.mockClear();

    await enableVoiceTracking();
    await speakFromCourt('Alex steal', 250, 800);

    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
    expect(apiMocks.appendEvent.mock.calls[0][1]).toEqual(buttonPayload);
  });

  test('surfaces a failed voice write once and restores the clock and video entry state', async () => {
    // Desktop layout keeps the video in the persistent left column, so the same run can observe
    // both the clock and the video being handed back after the failed write.
    const restoreMatchMedia = stubMatchMedia(true);
    try {
      installSpeechRecognition();
      currentResponse = createResponse({
        game: {
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          startingLineupPlayerIds: ['player-1'],
          currentLineupPlayerIds: ['player-1'],
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
      apiMocks.updateClock.mockImplementation(() => Promise.resolve(currentResponse));
      apiMocks.appendEvent.mockRejectedValue(new Error('Connection lost'));

      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Accept elapsed time' }));

      const iframe = document.querySelector('iframe');
      const postMessageSpy = vi.fn();
      Object.defineProperty(iframe, 'contentWindow', {
        configurable: true,
        value: { postMessage: postMessageSpy },
      });

      await enableVoiceTracking();
      const recognition = await startCourtVoice(250, 800);

      await waitFor(() =>
        expect(apiMocks.updateClock).toHaveBeenCalledWith('game-1', { action: 'pause' })
      );
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.stringContaining('pauseVideo'),
        expect.anything()
      );

      // A shot opens a follow-up optimistically, so this exercises the failure path that must
      // close that question and return ownership of playback and the clock.
      act(() => recognition.emitResult('Alex made'));

      await waitFor(() => expect(screen.getByText('Connection lost')).toBeInTheDocument());
      expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
      expect(
        screen.getAllByText('The command was understood, but the stat was not saved.').length
      ).toBeGreaterThan(0);
      await waitFor(() =>
        expect(apiMocks.updateClock).toHaveBeenCalledWith('game-1', { action: 'start' })
      );
      expect(apiMocks.updateClock).toHaveBeenCalledTimes(2);
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.stringContaining('playVideo'),
        expect.anything()
      );
    } finally {
      restoreMatchMedia();
    }
  });

  test('reconciles once and never replays the write when a voice command hits a 409', async () => {
    installSpeechRecognition();
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: ['player-1'],
        currentLineupPlayerIds: ['player-1'],
        gameFormat: {
          regulationSegmentType: 'quarter',
          regulationSegmentDurationSeconds: 600,
          overtimeDurationSeconds: 300,
        },
        clock: {
          status: 'paused',
          segmentKind: 'regulation',
          segmentNumber: 2,
          remainingMilliseconds: 321000,
          runningSince: null,
        },
      },
    });
    apiMocks.appendEvent.mockRejectedValue(
      Object.assign(new Error('Game changed elsewhere'), { status: 409 })
    );

    renderPage();
    await enableVoiceTracking();
    await speakFromCourt('Alex turnover', 250, 800);

    await waitFor(() => {
      expect(screen.getByText('Game changed elsewhere')).toBeInTheDocument();
      expect(apiMocks.getById).toHaveBeenCalledTimes(2);
    });
    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
  });

  test('removes the microphone when voice tracking is switched off again from More', async () => {
    installSpeechRecognition();
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: ['player-1'],
        currentLineupPlayerIds: ['player-1'],
      },
    });

    renderPage();
    await enableVoiceTracking();

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const toggle = screen.getByRole('button', { name: /Voice Tracking/ });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Off — tap to enable for this tracking session.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Court' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Record voice command' })).not.toBeInTheDocument()
    );
    expect(MockSpeechRecognition.instances).toHaveLength(0);
  });

  test('offers no voice tracking at all for an unsupported sport', async () => {
    installSpeechRecognition();
    currentResponse = createResponse({
      game: {
        sport: 'football',
        startingLineupPlayerIds: ['player-1'],
        currentLineupPlayerIds: ['player-1'],
      },
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'More' }));
    const toggle = screen.getByRole('button', { name: /Voice Tracking/ });
    expect(toggle).toBeDisabled();
    expect(screen.getByText('Not available for this sport.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Court' }));
    expect(screen.queryByRole('button', { name: 'Record voice command' })).not.toBeInTheDocument();
    expect(MockSpeechRecognition.instances).toHaveLength(0);
  });

  test('keeps the picker closed while court-triggered voice is listening, then opens it on cancel', async () => {
    installSpeechRecognition();
    const playerIds = ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'];
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: playerIds,
        currentLineupPlayerIds: playerIds,
      },
    });

    renderPage();
    await enableVoiceTracking();
    await startCourtVoice(250, 800);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Cancel voice command' })).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /Close event picker/i })).not.toBeInTheDocument();
    expect(apiMocks.appendEvent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel voice command' }));
    await waitForEventPicker();
    expect(
      within(getEventPicker()).queryByRole('button', { name: 'Record voice command' })
    ).not.toBeInTheDocument();
    expect(apiMocks.appendEvent).not.toHaveBeenCalled();

    await selectPickerPlayer('Alex');
    fireEvent.click(within(getEventPicker()).getByRole('button', { name: 'STL' }));
    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
  });

  test.each([
    ['an unknown player', 'Nobody steal', 'No on-court player matched that number or name.'],
    ['a bench player', 'Flynn steal', 'That player is not currently on the court.'],
  ])('records nothing when a voice command names %s', async (_label, transcript, message) => {
    installSpeechRecognition();
    const playerIds = ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'];
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: playerIds,
        currentLineupPlayerIds: playerIds,
      },
    });

    renderPage();
    await enableVoiceTracking();
    await speakFromCourt(transcript, 250, 800);

    await waitFor(() => expect(screen.getAllByText(message).length).toBeGreaterThan(0));
    expect(apiMocks.appendEvent).not.toHaveBeenCalled();
  });

  const ONE_SIDED_LINEUP = ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'];

  async function renderOneSidedVoiceGame(gameOverrides = {}) {
    installSpeechRecognition();
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: ONE_SIDED_LINEUP,
        currentLineupPlayerIds: ONE_SIDED_LINEUP,
        ...gameOverrides,
      },
    });

    renderPage();
    await enableVoiceTracking();
  }

  async function renderDualTeamVoiceGame(response) {
    installSpeechRecognition();
    currentResponse =
      response || createLeagueDualTeamResponse({ homeReady: true, awayReady: true });

    renderPage();
    await enableVoiceTracking();
  }

  // Both squads share jersey numbers 1-5, which is what makes a bare "2" ambiguous
  // across a dual-team rebound pool.
  function withSharedJerseys(response) {
    const numbered = (players) =>
      players.map((player, index) => ({ ...player, jerseyNumber: index + 1 }));
    return {
      ...response,
      participants: {
        home: {
          ...response.participants.home,
          players: numbered(response.participants.home.players),
        },
        away: {
          ...response.participants.away,
          players: numbered(response.participants.away.players),
        },
      },
    };
  }

  async function expectFollowUpQuestion(pattern) {
    await waitFor(() => expect(within(getEventPicker()).getByText(pattern)).toBeInTheDocument());
  }

  async function openAssistPromptByVoice() {
    await speakFromCourt('Alex made');
    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
    await expectFollowUpQuestion(/Who assisted\?/i);
  }

  async function openDualReboundPromptByVoice() {
    await speakFromCourt('home Alex miss');
    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
    await expectFollowUpQuestion(/Who got the rebound\?/i);
  }

  test('answers a one-sided assist follow-up by voice', async () => {
    await renderOneSidedVoiceGame();
    await openAssistPromptByVoice();

    await speak('Blake');

    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(2));
    expect(apiMocks.appendEvent.mock.calls[1][1]).toEqual(
      expect.objectContaining({ playerId: 'player-2', statType: 'AST' })
    );
    await expectVoiceMessage('Blake: Assist recorded.');
    await waitFor(() =>
      expect(screen.queryAllByRole('button', { name: /Close event picker/i })).toHaveLength(0)
    );
  });

  test('closes an assist follow-up with “unassisted” and records nothing', async () => {
    await renderOneSidedVoiceGame();
    await openAssistPromptByVoice();

    await speak('unassisted');

    await expectVoiceMessage('Unassisted. No assist recorded.');
    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryAllByRole('button', { name: /Close event picker/i })).toHaveLength(0)
    );
    expect(MockSpeechRecognition.instances).toHaveLength(2);
  });

  test('refuses the shooter as their own assister and keeps the question open', async () => {
    await renderOneSidedVoiceGame();
    await openAssistPromptByVoice();

    await speak('Alex');

    await expectVoiceMessage('That player is not valid for this question.');
    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
    expect(within(getEventPicker()).getByText(/Who assisted\?/i)).toBeInTheDocument();
  });

  test('credits an unsided dual-team rebound answer to the shooting side as an offensive rebound', async () => {
    await renderDualTeamVoiceGame();
    await openDualReboundPromptByVoice();

    await speak('Blake');

    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(2));
    expect(apiMocks.appendEvent.mock.calls[1][1]).toEqual(
      expect.objectContaining({ playerId: 'player-2', statType: 'OREB', teamSide: 'home' })
    );
    await expectVoiceMessage('Blake: Offensive Rebound recorded.');
  });

  test('credits a spoken opposing side on a dual-team rebound as a defensive rebound', async () => {
    await renderDualTeamVoiceGame();
    await openDualReboundPromptByVoice();

    await speak('away Away 3');

    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(2));
    expect(apiMocks.appendEvent.mock.calls[1][1]).toEqual(
      expect.objectContaining({ playerId: 'away-3', statType: 'DREB', teamSide: 'away' })
    );
    await expectVoiceMessage('Away 3: Defensive Rebound recorded.');
  });

  test('records nothing when a jersey number exists in both dual-team rebound pools', async () => {
    await renderDualTeamVoiceGame(
      withSharedJerseys(createLeagueDualTeamResponse({ homeReady: true, awayReady: true }))
    );
    await openDualReboundPromptByVoice();

    await speak('2');

    await expectVoiceMessage('More than one on-court player matched. No stat was recorded.');
    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
    expect(within(getEventPicker()).getByText(/Who got the rebound\?/i)).toBeInTheDocument();
  });

  test('records an opponent rebound from a one-sided rebound follow-up', async () => {
    await renderOneSidedVoiceGame();
    await speakFromCourt('Alex miss');
    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
    await expectFollowUpQuestion(/Who got the rebound\?/i);

    await speak('opponent');

    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(2));
    expect(apiMocks.appendEvent.mock.calls[1][1]).toEqual(
      expect.objectContaining({ statType: 'OPP_REB' })
    );
    await expectVoiceMessage('Opponent rebound recorded.');
  });

  test('rejects “opponent” on a dual-team rebound follow-up', async () => {
    await renderDualTeamVoiceGame();
    await openDualReboundPromptByVoice();

    await speak('opponent');

    await expectVoiceMessage(
      'That answer is not valid for this question. Say a player number, or “skip”.'
    );
    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
    expect(within(getEventPicker()).getByText(/Who got the rebound\?/i)).toBeInTheDocument();
  });

  test('answers the who-missed-shot follow-up opened by a dual-team defensive rebound', async () => {
    await renderDualTeamVoiceGame();
    await speak('home Alex defensive rebound');
    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
    expect(apiMocks.appendEvent.mock.calls[0][1]).toEqual(
      expect.objectContaining({ playerId: 'player-1', statType: 'DREB', teamSide: 'home' })
    );
    await expectFollowUpQuestion(/Who missed the shot\?/i);

    await speak('away Away 2');

    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(2));
    expect(apiMocks.appendEvent.mock.calls[1][1]).toEqual(
      expect.objectContaining({ playerId: 'away-2', statType: 'FG2_MISS', teamSide: 'away' })
    );
  });

  test.each([
    ['a steal', 'home Alex steal', 'STL', /Who turned over the ball\?/i, 'TOV'],
    ['a turnover', 'home Alex turnover', 'TOV', /Who got the steal\?/i, 'STL'],
  ])(
    'answers the opposing-side follow-up opened by %s',
    async (_label, transcript, primaryStat, question, followUpStat) => {
      await renderDualTeamVoiceGame();
      await speak(transcript);
      await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
      expect(apiMocks.appendEvent.mock.calls[0][1]).toEqual(
        expect.objectContaining({ playerId: 'player-1', statType: primaryStat, teamSide: 'home' })
      );
      await expectFollowUpQuestion(question);

      await speak('home Blake');
      await expectVoiceMessage('This question is about the other team.');
      expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);

      await speak('away Away 2');
      await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(2));
      expect(apiMocks.appendEvent.mock.calls[1][1]).toEqual(
        expect.objectContaining({ playerId: 'away-2', statType: followUpStat, teamSide: 'away' })
      );
    }
  );

  test('treats the who-was-fouled follow-up as skip-only', async () => {
    await renderDualTeamVoiceGame();
    await speak('home Alex foul');
    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
    await expectFollowUpQuestion(/Who was fouled\?/i);

    await speak('away Away 2');

    await expectVoiceMessage(
      'The fouled player is not recorded yet. Say “skip” to close this question.'
    );
    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
    expect(within(getEventPicker()).getByText(/Who was fouled\?/i)).toBeInTheDocument();

    await speak('skip');

    await expectVoiceMessage('Question skipped. No stat was recorded.');
    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryAllByRole('button', { name: /Close event picker/i })).toHaveLength(0)
    );
  });

  test('skips an open assist question by voice', async () => {
    await renderOneSidedVoiceGame();
    await openAssistPromptByVoice();

    await speak('skip');

    await expectVoiceMessage('Question skipped. No stat was recorded.');
    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryAllByRole('button', { name: /Close event picker/i })).toHaveLength(0)
    );
  });

  test('does not let the transcript that opens a follow-up also answer it', async () => {
    await renderOneSidedVoiceGame();
    await speakFromCourt('Alex made');

    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
    await expectFollowUpQuestion(/Who assisted\?/i);
    await expectVoiceMessage('Alex: 3PT Make recorded.');
    // The single cycle produced the shot only; the assist is still unanswered.
    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
  });

  test('refuses a new primary command while a follow-up question is open', async () => {
    await renderOneSidedVoiceGame();
    await openAssistPromptByVoice();

    await speak('Blake steal');

    await expectVoiceMessage(
      'That answer is not valid for this question. Say a player number, or “skip”.'
    );
    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
    expect(within(getEventPicker()).getByText(/Who assisted\?/i)).toBeInTheDocument();
  });

  test('refuses “undo” while a follow-up question is open', async () => {
    await renderOneSidedVoiceGame();
    await openAssistPromptByVoice();

    await speak('undo');

    await expectVoiceMessage('Finish or skip the open question before saying “undo”.');
    expect(apiMocks.removeEvent).not.toHaveBeenCalled();
    expect(within(getEventPicker()).getByText(/Who assisted\?/i)).toBeInTheDocument();
  });

  test('records nothing when an answer is spoken after the primary write failed', async () => {
    await renderOneSidedVoiceGame();
    apiMocks.appendEvent.mockRejectedValue(new Error('Connection lost'));

    await speakFromCourt('Alex made');
    await expectVoiceMessage('The command was understood, but the stat was not saved.');
    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);

    await speak('Blake');

    await expectVoiceMessage('Say one player and one supported stat.');
    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
  });

  test('lets a follow-up answer succeed after an earlier answer failed to save', async () => {
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: ONE_SIDED_LINEUP,
        currentLineupPlayerIds: ONE_SIDED_LINEUP,
      },
    });

    renderPage();
    pointerDown(await screen.findByTestId('interactive-court-image'), {
      clientX: 475,
      clientY: 900,
    });
    await waitForEventPicker();
    await selectPickerPlayer('Alex');
    fireEvent.click(within(getEventPicker()).getByRole('button', { name: 'Make' }));
    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
    await expectFollowUpQuestion(/Who assisted\?/i);

    apiMocks.appendEvent.mockRejectedValueOnce(new Error('Assist write failed'));
    fireEvent.click(
      within(getEventPicker()).getByRole('button', { name: playerButtonName('Blake') })
    );
    await waitFor(() => expect(screen.getByText('Assist write failed')).toBeInTheDocument());
    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(2);
    expect(within(getEventPicker()).getByText(/Who assisted\?/i)).toBeInTheDocument();

    // A rejected promise left behind in inflightRef would silently swallow this answer.
    fireEvent.click(
      within(getEventPicker()).getByRole('button', { name: playerButtonName('Casey') })
    );
    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(3));
    expect(apiMocks.appendEvent.mock.calls[2][1]).toEqual(
      expect.objectContaining({ playerId: 'player-3', statType: 'AST' })
    );
  });

  test('still stamps a voice event with the video timestamp after a skipped follow-up', async () => {
    const restoreMatchMedia = stubMatchMedia(true);
    try {
      installSpeechRecognition();
      currentResponse = createResponse({
        game: {
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          startingLineupPlayerIds: ONE_SIDED_LINEUP,
          currentLineupPlayerIds: ONE_SIDED_LINEUP,
        },
      });

      renderPage();
      const iframe = await screen.findByTitle('Dev Scrimmage');
      fireEvent(
        window,
        new MessageEvent('message', {
          data: JSON.stringify({ event: 'infoDelivery', info: { currentTime: 27.6 } }),
          source: iframe.contentWindow,
        })
      );

      tapCourtAt(250, 800);
      await waitForEventPicker();
      await selectPickerPlayer('Alex');
      fireEvent.click(within(getEventPicker()).getByRole('button', { name: 'FT-' }));
      await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
      await expectFollowUpQuestion(/Who got the rebound\?/i);

      // Skipping keeps the entry open but drops the captured timestamp.
      fireEvent.click(getLastButtonByName(/Skip this question/i));
      await waitFor(() =>
        expect(screen.queryAllByRole('button', { name: /Close event picker/i })).toHaveLength(0)
      );

      await enableVoiceTracking();
      await speak('Alex turnover');

      await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(2));
      expect(apiMocks.appendEvent.mock.calls[1][1]).toEqual(
        expect.objectContaining({ playerId: 'player-1', statType: 'TOV', videoTimestamp: 28 })
      );
    } finally {
      restoreMatchMedia();
    }
  });

  test('cancels a listening follow-up cycle when the question is closed underneath it', async () => {
    await renderOneSidedVoiceGame();
    await openAssistPromptByVoice();

    const recognition = await startListening();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(recognition.abort).toHaveBeenCalled();

    act(() => recognition.emitResult('Blake'));
    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
  });

  test('writes once when a follow-up cycle delivers the same result twice', async () => {
    await renderOneSidedVoiceGame();
    await openAssistPromptByVoice();

    fireEvent.click(await screen.findByRole('button', { name: 'Record voice command' }));
    const recognition = MockSpeechRecognition.instances.at(-1);
    act(() => recognition.emitStart());
    act(() => {
      recognition.emitResult('Blake');
      recognition.emitResult('Blake');
    });

    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(2));
    await expectVoiceMessage('Blake: Assist recorded.');
    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(2);
  });

  test('ignores a follow-up result that arrives after recognition already failed', async () => {
    await renderOneSidedVoiceGame();
    await openAssistPromptByVoice();

    const recognition = await startListening();
    act(() => recognition.emitError('network'));
    await expectVoiceMessage(
      'The browser speech service could not be reached. No stat was recorded.'
    );

    act(() => recognition.emitResult('Blake'));

    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
    expect(within(getEventPicker()).getByText(/Who assisted\?/i)).toBeInTheDocument();
  });

  test('aborts a listening follow-up cycle on unmount without writing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await renderOneSidedVoiceGame();
      await openAssistPromptByVoice();

      const recognition = await startListening();
      cleanup();

      expect(recognition.abort).toHaveBeenCalled();
      expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  test('times out a follow-up cycle and leaves the question open', async () => {
    await renderOneSidedVoiceGame();
    await openAssistPromptByVoice();

    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Record voice command' }));
      const recognition = MockSpeechRecognition.instances.at(-1);
      act(() => recognition.emitStart());
      act(() => vi.advanceTimersByTime(8000));

      expect(recognition.abort).toHaveBeenCalled();
      expect(
        screen.getAllByText('Listening timed out. No stat was recorded.').length
      ).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }

    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
    expect(within(getEventPicker()).getByText(/Who assisted\?/i)).toBeInTheDocument();
  });

  test('undoes the expected last event by voice and hands the clock and video back', async () => {
    const restoreMatchMedia = stubMatchMedia(true);
    try {
      installSpeechRecognition();
      currentResponse = createResponse({
        game: {
          videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          startingLineupPlayerIds: ONE_SIDED_LINEUP,
          currentLineupPlayerIds: ONE_SIDED_LINEUP,
          events: [{ id: 'event-1', playerId: 'player-1', statType: 'STL' }],
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
      apiMocks.updateClock.mockImplementation(() => Promise.resolve(currentResponse));

      renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Accept elapsed time' }));

      const iframe = document.querySelector('iframe');
      const postMessageSpy = vi.fn();
      Object.defineProperty(iframe, 'contentWindow', {
        configurable: true,
        value: { postMessage: postMessageSpy },
      });

      await enableVoiceTracking();
      await speak('undo');

      await waitFor(() => expect(apiMocks.removeEvent).toHaveBeenCalledWith('game-1', 'event-1'));
      await expectVoiceMessage('Last event undone.');
      await waitFor(() =>
        expect(apiMocks.updateClock).toHaveBeenCalledWith('game-1', { action: 'start' })
      );
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.stringContaining('playVideo'),
        expect.anything()
      );
    } finally {
      restoreMatchMedia();
    }
  });

  test('refuses a voice undo when the event log moved on while listening', async () => {
    installSpeechRecognition();
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: ONE_SIDED_LINEUP,
        currentLineupPlayerIds: ONE_SIDED_LINEUP,
        events: [{ id: 'event-1', playerId: 'player-1', statType: 'STL' }],
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
    const movedResponse = {
      ...currentResponse,
      game: {
        ...currentResponse.game,
        events: [
          ...currentResponse.game.events,
          { id: 'event-2', playerId: 'player-2', statType: 'TOV' },
        ],
      },
    };
    let resolvePause;
    const pauseResponse = new Promise((resolve) => {
      resolvePause = resolve;
    });
    apiMocks.updateClock.mockImplementation((_gameId, command) =>
      command.action === 'pause' ? pauseResponse : Promise.resolve(movedResponse)
    );

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept elapsed time' }));
    await enableVoiceTracking();

    const recognition = await startListening();
    await waitFor(() =>
      expect(apiMocks.updateClock).toHaveBeenCalledWith('game-1', { action: 'pause' })
    );
    // Recognition captured event-1. Only now does the clock response reveal a newer tail.
    await act(async () => {
      resolvePause(movedResponse);
      await pauseResponse;
    });
    act(() => recognition.emitResult('undo'));

    await waitFor(() =>
      expect(apiMocks.updateClock).toHaveBeenCalledWith('game-1', { action: 'start' })
    );
    expect(apiMocks.removeEvent).not.toHaveBeenCalled();
  });

  test('reports that there is nothing to undo by voice on an empty event log', async () => {
    await renderOneSidedVoiceGame();

    await speak('undo');

    await expectVoiceMessage('There is no event to undo.');
    expect(apiMocks.removeEvent).not.toHaveBeenCalled();
  });

  test('keeps the manual Undo Last button working and refuses it while a question is open', async () => {
    currentResponse = createResponse({
      game: {
        startingLineupPlayerIds: ONE_SIDED_LINEUP,
        currentLineupPlayerIds: ONE_SIDED_LINEUP,
      },
    });

    renderPage();
    pointerDown(await screen.findByTestId('interactive-court-image'), {
      clientX: 475,
      clientY: 900,
    });
    await waitForEventPicker();
    await selectPickerPlayer('Alex');
    fireEvent.click(within(getEventPicker()).getByRole('button', { name: 'Make' }));
    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
    await expectFollowUpQuestion(/Who assisted\?/i);

    fireEvent.click(screen.getByRole('button', { name: 'Events' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo Last' }));
    await waitFor(() =>
      expect(screen.getByText('Close the open event question first')).toBeInTheDocument()
    );
    expect(apiMocks.removeEvent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Court' }));
    fireEvent.click(getLastButtonByName(/Skip this question/i));
    await waitFor(() =>
      expect(screen.queryAllByRole('button', { name: /Close event picker/i })).toHaveLength(0)
    );

    fireEvent.click(screen.getByRole('button', { name: 'Events' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo Last' }));
    await waitFor(() => expect(apiMocks.removeEvent).toHaveBeenCalledWith('game-1', 'event-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Undo Last' }));
    await waitFor(() => expect(screen.getByText('No event to undo')).toBeInTheDocument());
    expect(apiMocks.removeEvent).toHaveBeenCalledTimes(1);
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

    // The dialog stays mounted for the length of its exit animation before it
    // leaves the tree, so this waits for the removal rather than asserting on
    // the same tick as the click.
    await waitFor(() =>
      expect(screen.queryByText('Start with fewer than five players?')).not.toBeInTheDocument()
    );
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
    // LiveScore renders the value as an sr-only node plus animated digits, so
    // the alignment lives on the wrapping <p>.
    expect(within(awayButton).getByText('0', { selector: '.sr-only' }).closest('p')).toHaveClass(
      'text-right'
    );

    const clockContainer = screen.getByLabelText('Game clock').closest('section').parentElement;
    expect(clockContainer).toHaveClass('md:col-start-2', 'md:row-start-1');
    expect(screen.getByTestId('game-track-score-header')).toHaveClass(
      'md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]'
    );
  });

  test('shows only on-court players for assist follow-up and includes Unassisted', async () => {
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
    expect(within(overlay).getByRole('button', { name: /Unassisted/i })).toBeInTheDocument();
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

  test('keeps the initiating team side on a dual-team shot and its assist follow-up', async () => {
    currentResponse = createLeagueDualTeamResponse({ homeReady: true, awayReady: true });
    apiMocks.getById.mockResolvedValue(currentResponse);

    renderPage();
    const court = await screen.findByTestId('interactive-court-image');
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
    const awaySideButton = within(getEventPicker()).getByRole('button', { name: /Away Squad$/ });
    // The first post-pointer click is intentionally swallowed by the picker's ghost-click guard.
    fireEvent.click(awaySideButton);
    fireEvent.click(awaySideButton);
    await selectPickerPlayer('Away 1');
    fireEvent.click(within(getEventPicker()).getByRole('button', { name: 'Make' }));

    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1));
    expect(apiMocks.appendEvent.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        playerId: 'away-1',
        statType: expect.stringMatching(/^FG[23]_MADE$/),
        teamSide: 'away',
        courtLayoutId: 'legacy-v1',
      })
    );

    fireEvent.click(
      within(getEventPicker()).getByRole('button', { name: playerButtonName('Away 2') })
    );
    await waitFor(() => expect(apiMocks.appendEvent).toHaveBeenCalledTimes(2));
    expect(apiMocks.appendEvent.mock.calls[1][1]).toEqual(
      expect.objectContaining({ playerId: 'away-2', statType: 'AST', teamSide: 'away' })
    );
  });

  test.each([
    ['a conflict', Object.assign(new Error('Game changed elsewhere'), { status: 409 })],
    ['an uncertain network failure', new Error('Connection lost')],
  ])('reconciles once without retrying after %s', async (_label, submitError) => {
    currentResponse = createResponse({
      game: {
        currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
      },
    });
    apiMocks.appendEvent.mockRejectedValue(submitError);

    renderPage();
    pointerDown(await screen.findByTestId('interactive-court-image'), {
      clientX: 250,
      clientY: 800,
    });
    await waitForEventPicker();
    await selectPickerPlayer('Alex');
    fireEvent.click(within(getEventPicker()).getByRole('button', { name: 'STL' }));

    await waitFor(() => {
      expect(screen.getByText(submitError.message)).toBeInTheDocument();
      expect(apiMocks.getById).toHaveBeenCalledTimes(2);
    });
    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
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

    // The court opens in the landscape view, so a pointer position maps to
    // stored coordinates as x = y%, y = 100 - x%. These clientX/clientY values
    // are the rotated equivalent of the centre-paint tap this test asserts.
    pointerDown(court, { clientX: 74.45, clientY: 470 });
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
    pointerDown(updatedCourt, { clientX: 74.45, clientY: 470 });
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
    expect(quickStatPayload).toEqual(
      expect.objectContaining({ x: 50, y: 85.11, zoneId: 'PAINT', courtLayoutId: 'legacy-v1' })
    );
  });

  test('updates on-court and bench lists after a substitution', async () => {
    currentResponse = createResponse({
      game: {
        currentLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
        startingLineupPlayerIds: ['player-1', 'player-2', 'player-3', 'player-4', 'player-5'],
      },
    });

    renderPage();

    await screen.findByRole('button', { name: 'Subs' });

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

    expect(screen.getByText(/On Bench/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Court' }));
    tapCourtAt(250, 800);
    await waitForEventPicker();
    expect(
      within(getEventPicker()).getByRole('button', { name: playerButtonName('Flynn') })
    ).toBeInTheDocument();
    expect(
      within(getEventPicker()).queryByRole('button', { name: playerButtonName('Alex') })
    ).not.toBeInTheDocument();
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

    // The tracker opens in the landscape view.
    expect(getActiveCourt().style.transform).toContain('rotate(90deg)');

    fireEvent.click(screen.getByRole('button', { name: /More/i }));
    fireEvent.click(screen.getByRole('button', { name: /Rotate Court/i }));

    expect(screen.getByText(/Currently vertical/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Court' }));
    expect(getActiveCourt().style.transform).not.toContain('rotate(90deg)');

    fireEvent.click(screen.getByRole('button', { name: /Fullscreen/i }));
    expect(getActiveCourt().style.transform).not.toContain('rotate(90deg)');

    // ...and back again, so the toggle is proven in both directions.
    fireEvent.click(screen.getByRole('button', { name: /More/i }));
    fireEvent.click(screen.getByRole('button', { name: /Rotate Court/i }));
    expect(screen.getByText(/Currently horizontal/i)).toBeInTheDocument();
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

  test('mobile entry mode limits stat attribution to on-court players', async () => {
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

      tapCourtAt(250, 800);
      await waitForEventPicker();
      expect(
        within(getEventPicker()).queryByRole('button', { name: playerButtonName('Flynn') })
      ).not.toBeInTheDocument();
      expect(
        within(getEventPicker()).getByRole('button', { name: playerButtonName('Alex') })
      ).toBeInTheDocument();
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
