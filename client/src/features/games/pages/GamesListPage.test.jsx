import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { GamesListPage } from './GamesListPage';
import { gamesApi } from '../api/gamesApi';

vi.mock('../api/gamesApi', () => ({
  gamesApi: {
    list: vi.fn().mockResolvedValue({ games: [] }),
  },
}));

describe('GamesListPage', () => {
  test('renders empty state when no games exist', async () => {
    render(
      <MemoryRouter>
        <GamesListPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /New Game/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/No games yet/i)).toBeInTheDocument();
    });
  });

  test('renders icon actions for details and tracking when game is in progress', async () => {
    gamesApi.list.mockResolvedValueOnce({
      games: [{ id: 'g1', title: 'vs Falcons', status: 'in_progress', opponent: 'Falcons' }],
    });

    render(
      <MemoryRouter>
        <GamesListPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: /Open details for vs Falcons/i })
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: /Track vs Falcons/i })).toBeInTheDocument();
    expect(screen.getByText(/Opponent: Falcons/i)).toBeInTheDocument();
  });

  test('shows Opponent: N/A when opponent is missing', async () => {
    gamesApi.list.mockResolvedValueOnce({
      games: [{ id: 'g1', title: 'Scrimmage', status: 'completed' }],
    });

    render(
      <MemoryRouter>
        <GamesListPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Opponent: N\/A/i)).toBeInTheDocument();
    });
  });
});
