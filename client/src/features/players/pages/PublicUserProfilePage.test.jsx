import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicUserProfilePage } from './PublicUserProfilePage';
import { playersApi } from '../api/playersApi';

vi.mock('../api/playersApi', () => ({
  playersApi: { getPublicUserProfiles: vi.fn() },
}));

function renderAtUserId(userId) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/players/${userId}`]}>
        <Routes>
          <Route path="/players/:userId" element={<PublicUserProfilePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PublicUserProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders user header and profile cards on success', async () => {
    playersApi.getPublicUserProfiles.mockResolvedValue({
      user: { id: 'user-1', name: 'Jamie Rivera', avatarUrl: null },
      profiles: [
        {
          id: 'lp-1',
          displayName: 'Jamie Rivera',
          jerseyNumber: 7,
          position: 'PG',
          memberRoleLabel: 'Player',
          team: { name: 'Hawks', logo: null },
          league: { name: 'City League', seasonLabel: 'Spring 2026' },
          profileHref: '/league/city-league/teams/hawks/players/lp-1',
          summary: { gamesCount: 4, pointsPerGame: 10, reboundsPerGame: 5, assistsPerGame: 2 },
        },
      ],
    });

    renderAtUserId('user-1');

    await waitFor(() => expect(screen.getAllByText('Jamie Rivera').length).toBeGreaterThan(0));
    expect(screen.getByText('Hawks')).toBeInTheDocument();
    expect(screen.getByText('4 GP')).toBeInTheDocument();
  });

  test('renders a not-found message on 404', async () => {
    const error = new Error('Player not found');
    error.status = 404;
    playersApi.getPublicUserProfiles.mockRejectedValue(error);

    renderAtUserId('user-404');

    await waitFor(() => expect(screen.getByText(/no public profiles/i)).toBeInTheDocument());
  });
});
