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
    players: [{ playerId: 'player-1', displayName: 'Alex', points: 0 }],
    teamTotals: { points: 0 },
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
    apiMocks.appendEvent.mockImplementation((gameId, payload) =>
      Promise.resolve({
        game: {
          ...baseResponse.game,
          events: [{ id: 'event-1', ...payload }],
        },
        boxScore: baseResponse.boxScore,
      })
    );
  });

  test('tap + Shot Make sends inferred shot payload', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Track Game:/i)).toBeInTheDocument();
    });

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
      expect(apiMocks.appendEvent).toHaveBeenCalled();
    });

    const [, payload] = apiMocks.appendEvent.mock.calls[0];
    expect(payload.statType).toBe('FG3_MADE');
    expect(payload.zoneId).toBe('CORNER_RIGHT_3');
    expect(payload.x).toBeTypeOf('number');
    expect(payload.y).toBeTypeOf('number');
  });

  test('FT Make uses fixed free-throw-line payload with south fallback', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Track Game:/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /FT Make/i }));

    await waitFor(() => {
      expect(apiMocks.appendEvent).toHaveBeenCalled();
    });

    const [, payload] = apiMocks.appendEvent.mock.calls[0];
    expect(payload.statType).toBe('FT_MADE');
    expect(payload.zoneId).toBe('FREE_THROW_LINE');
    expect(payload.y).toBeGreaterThan(50);
  });
});
