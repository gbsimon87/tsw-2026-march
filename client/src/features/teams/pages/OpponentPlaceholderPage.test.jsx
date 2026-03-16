import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { OpponentPlaceholderPage } from './OpponentPlaceholderPage';
import { teamsApi } from '../api/teamsApi';

vi.mock('../api/teamsApi', () => ({
  teamsApi: {
    getPublicOpponentBySlug: vi.fn(),
  },
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/opponents/falcons']}>
      <Routes>
        <Route path="/opponents/:opponentSlug" element={<OpponentPlaceholderPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('OpponentPlaceholderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test('renders opponent hero, related games, and links back into the app', async () => {
    teamsApi.getPublicOpponentBySlug.mockResolvedValue({
      opponent: { slug: 'falcons', displayName: 'Falcons', matchedTeam: null },
      summary: { gamesCount: 2, latestGameAt: '2026-03-12T00:00:00.000Z' },
      relatedGames: [
        {
          id: 'g1',
          title: 'vs Falcons',
          opponent: 'Falcons',
          scheduledAt: '2026-03-12T00:00:00.000Z',
          completedAt: '2026-03-12T02:00:00.000Z',
          createdAt: '2026-03-12T00:00:00.000Z',
          teamPoints: 72,
          team: { id: 'team-1', name: 'TSW Blue' },
        },
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Falcons')).toBeInTheDocument();
    });

    expect(teamsApi.getPublicOpponentBySlug).toHaveBeenCalledWith('falcons');
    expect(screen.getByText(/does not have a public team page/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TSW Blue' })).toHaveAttribute('href', '/teams/team-1');
    expect(screen.getByRole('link', { name: /View game/i })).toHaveAttribute('href', '/games/g1');
    expect(screen.getByRole('link', { name: /Explore teams/i })).toHaveAttribute('href', '/');
  });

  test('renders error state for unknown opponents', async () => {
    teamsApi.getPublicOpponentBySlug.mockRejectedValue(new Error('Opponent not found'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Opponent not found/i)).toBeInTheDocument();
    });
  });
});
