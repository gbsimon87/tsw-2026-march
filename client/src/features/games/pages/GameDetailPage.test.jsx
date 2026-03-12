import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { GameDetailPage } from './GameDetailPage';

const apiMocks = vi.hoisted(() => ({
  getById: vi.fn(),
}));

vi.mock('../api/gamesApi', () => ({
  gamesApi: apiMocks,
}));

describe('GameDetailPage', () => {
  test('renders box score, metadata, and play by play', async () => {
    apiMocks.getById.mockResolvedValue({
      game: {
        id: 'game-1',
        title: 'vs Wildcats',
        status: 'completed',
        scheduledAt: '2026-03-12T18:00:00.000Z',
        createdAt: '2026-03-12T17:45:00.000Z',
        completedAt: '2026-03-12T19:20:00.000Z',
        events: [
          {
            id: 'e1',
            playerId: 'p1',
            statType: 'FG2_MADE',
            zoneId: 'PAINT',
            x: 51,
            y: 78,
            occurredAt: '2026-03-12T18:03:00.000Z',
          },
          {
            id: 'e2',
            playerId: 'p2',
            statType: 'FG3_MISS',
            zoneId: 'ABOVE_BREAK_THREE',
            x: 24,
            y: 36,
            occurredAt: '2026-03-12T18:04:00.000Z',
          },
          {
            id: 'e3',
            playerId: 'p1',
            statType: 'FT_MADE',
            zoneId: 'FREE_THROW_LINE',
            x: 50,
            y: 20,
            occurredAt: '2026-03-12T18:05:00.000Z',
          },
        ],
      },
      team: {
        id: 'team-1',
        name: 'TSW Team',
        players: [
          { id: 'p1', displayName: 'Alex', isActive: true },
          { id: 'p2', displayName: 'Jordan', isActive: true },
        ],
      },
      boxScore: {
        players: [
          {
            playerId: 'p1',
            displayName: 'Alex',
            ftm: 0,
            fta: 0,
            fg2m: 1,
            fg2a: 1,
            fg3m: 0,
            fg3a: 0,
            points: 2,
          },
        ],
        teamTotals: { ftm: 0, fta: 0, fg2m: 1, fg2a: 1, fg3m: 0, fg3a: 0, points: 2 },
      },
    });

    render(
      <MemoryRouter initialEntries={['/games/game-1']}>
        <Routes>
          <Route path="/games/:gameId" element={<GameDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/vs Wildcats/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Box Score/i)).toBeInTheDocument();
    expect(screen.getByText(/Play by Play/i)).toBeInTheDocument();
    expect(screen.getByText(/Shot Map/i)).toBeInTheDocument();
    expect(screen.getByText(/Game Date \/ Time/i)).toBeInTheDocument();
    expect(screen.getByText(/Alex: 2PT Make/i)).toBeInTheDocument();
    expect(screen.getByText(/Paint/i)).toBeInTheDocument();
    expect(screen.getByTestId('game-shot-map')).toBeInTheDocument();
    expect(screen.getAllByTestId('shot-made-marker')).toHaveLength(1);
    expect(screen.getAllByTestId('shot-miss-marker')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText('Player'), { target: { value: 'p1' } });
    expect(screen.getAllByTestId('shot-made-marker')).toHaveLength(1);
    expect(screen.queryByTestId('shot-miss-marker')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2PT' }));
    expect(screen.getAllByTestId('shot-made-marker')).toHaveLength(1);
    expect(screen.queryByTestId('shot-miss-marker')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Player'), { target: { value: 'ALL' } });
    fireEvent.click(screen.getByRole('button', { name: '3PT' }));
    expect(screen.queryByTestId('shot-made-marker')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('shot-miss-marker')).toHaveLength(1);
  });
});
