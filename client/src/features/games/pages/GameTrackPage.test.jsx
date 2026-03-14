import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GameTrackPage } from './GameTrackPage';

const apiMocks = vi.hoisted(() => ({
  getById: vi.fn(),
  appendEvent: vi.fn(),
  removeEvent: vi.fn(),
  finish: vi.fn(),
}));

vi.mock('../api/gamesApi', () => ({
  gamesApi: apiMocks,
}));

const baseResponse = {
  game: {
    id: 'game-1',
    title: 'Dev Scrimmage',
    status: 'in_progress',
    events: [],
  },
  team: {
    id: 'team-1',
    name: 'TSW Team',
    players: [{ id: 'player-1', displayName: 'Alex', isActive: true }],
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
        reb: 6,
        oreb: 2,
        dreb: 4,
        ftm: 3,
        fta: 5,
      },
    ],
    teamTotals: {
      fg2m: 5,
      fg2a: 7,
      fg3m: 3,
      fg3a: 5,
      points: 22,
      reb: 6,
      oreb: 2,
      dreb: 4,
      ftm: 3,
      fta: 5,
    },
  },
};

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/games/game-1/track']}>
      <Routes>
        <Route path="/games/:gameId/track" element={<GameTrackPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('GameTrackPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    apiMocks.getById.mockReset();
    apiMocks.appendEvent.mockReset();
    apiMocks.removeEvent.mockReset();
    apiMocks.finish.mockReset();

    apiMocks.getById.mockResolvedValue(baseResponse);
    apiMocks.appendEvent.mockImplementation((gameId, payload) => {
      const row = { ...baseResponse.boxScore.players[0] };
      const totals = { ...baseResponse.boxScore.teamTotals };

      if (payload.statType === 'OREB') {
        row.oreb += 1;
        row.reb += 1;
        totals.oreb += 1;
        totals.reb += 1;
      }

      if (payload.statType === 'DREB') {
        row.dreb += 1;
        row.reb += 1;
        totals.dreb += 1;
        totals.reb += 1;
      }

      return Promise.resolve({
        game: {
          ...baseResponse.game,
          events: [{ id: `event-${payload.statType}`, ...payload }],
        },
        boxScore: {
          players: [row],
          teamTotals: totals,
        },
      });
    });
  });

  test('tap + Shot Make sends inferred shot payload', async () => {
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Open Full Screen Tracking/i })
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^Rebound$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Open Full Screen Tracking/i }));
    expect(screen.getByRole('button', { name: /Close full screen tracking/i })).toBeInTheDocument();

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
    expect(screen.getByText(/Add Event/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Shot Make/i }));

    await waitFor(() => {
      expect(apiMocks.appendEvent).toHaveBeenCalled();
    });

    const [, payload] = apiMocks.appendEvent.mock.calls[0];
    expect(payload.statType).toBe('FG3_MADE');
    expect(payload.zoneId).toBe('CORNER_RIGHT_3');
    expect(payload.x).toBeTypeOf('number');
    expect(payload.y).toBeTypeOf('number');
  });

  test('FT Make uses fixed free-throw-line payload', async () => {
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Open Full Screen Tracking/i })
      ).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /FT Make/i }));

    await waitFor(() => {
      expect(apiMocks.appendEvent).toHaveBeenCalled();
    });

    const [, payload] = apiMocks.appendEvent.mock.calls[0];
    expect(payload.statType).toBe('FT_MADE');
    expect(payload.zoneId).toBe('FREE_THROW_LINE');
    expect(payload.y).toBeTypeOf('number');
  });

  test('Shot Miss prompts for rebound and logs offensive rebound for selected player', async () => {
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Open Full Screen Tracking/i })
      ).toBeInTheDocument();
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

    fireEvent.click(court, { clientX: 475, clientY: 900 });
    fireEvent.click(screen.getByRole('button', { name: /Shot Miss/i }));

    await waitFor(() => {
      expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText(/Who got the rebound/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Other Team/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Alex' }));

    await waitFor(() => {
      expect(apiMocks.appendEvent).toHaveBeenCalledTimes(2);
    });

    const [, reboundPayload] = apiMocks.appendEvent.mock.calls[1];
    expect(reboundPayload).toEqual({
      playerId: 'player-1',
      statType: 'OREB',
    });
  });

  test('No Rebound does not log a rebound event after a miss', async () => {
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Open Full Screen Tracking/i })
      ).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /No Rebound/i }));
    expect(apiMocks.appendEvent).toHaveBeenCalledTimes(1);
  });

  test('defensive rebound is logged from the player action module', async () => {
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Open Full Screen Tracking/i })
      ).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /Defensive Rebound/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Defensive Rebound/i }));

    await waitFor(() => {
      expect(apiMocks.appendEvent).toHaveBeenCalled();
    });

    expect(apiMocks.appendEvent.mock.calls[0][1]).toEqual({
      playerId: 'player-1',
      statType: 'DREB',
    });
  });

  test('renders the live box score table with derived values', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Live Box Score')).toBeInTheDocument();
    });

    expect(screen.getByText('PTS')).toBeInTheDocument();
    expect(screen.getByText('REB')).toBeInTheDocument();
    expect(screen.getByText('2PT FG')).toBeInTheDocument();
    expect(screen.getByText('2PT FG%')).toBeInTheDocument();
    expect(screen.getByText('3PT FG')).toBeInTheDocument();
    expect(screen.getByText('3PT %')).toBeInTheDocument();
    expect(screen.getByText('Free Throw')).toBeInTheDocument();
    expect(screen.getByText('OREB')).toBeInTheDocument();
    expect(screen.getByText('DREB')).toBeInTheDocument();
    expect(screen.getAllByText('5/7')).toHaveLength(2);
    expect(screen.getAllByText('71.4%')).toHaveLength(2);
    expect(screen.getAllByText('3/5')).toHaveLength(4);
    expect(screen.getAllByText('22')).toHaveLength(2);
    expect(screen.getAllByText('6')).toHaveLength(2);
    expect(screen.getAllByText('2')).not.toHaveLength(0);
    expect(screen.getAllByText('4')).not.toHaveLength(0);
    expect(screen.getAllByText('60.0%')).toHaveLength(2);
    expect(screen.getByText('Team Total')).toBeInTheDocument();
  });
});
