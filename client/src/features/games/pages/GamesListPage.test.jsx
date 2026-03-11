import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { GamesListPage } from './GamesListPage';

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

    await waitFor(() => {
      expect(screen.getByText(/No games yet/i)).toBeInTheDocument();
    });
  });
});
