import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

// OPT-014b: GamesListPage now uses React Query — wrap it in a provider with a
// fresh client per render so cached data doesn't leak between tests.
function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GamesListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('GamesListPage', () => {
  test('renders empty state when no games exist', async () => {
    renderPage();

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

    renderPage();

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

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Opponent: N\/A/i)).toBeInTheDocument();
    });
  });
});
