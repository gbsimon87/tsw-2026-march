import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HomePage } from './HomePage';
import { teamsApi } from '../features/teams/api/teamsApi';

vi.mock('../app/store/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));

vi.mock('../features/teams/api/teamsApi', () => ({
  teamsApi: {
    listPublicExploreGames: vi.fn(),
  },
}));

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test('renders explore games from distinct teams', async () => {
    teamsApi.listPublicExploreGames.mockResolvedValue({
      games: [
        {
          id: 'g1',
          title: 'vs Falcons',
          opponent: 'Falcons',
          scheduledAt: '2026-03-10T00:00:00.000Z',
          completedAt: '2026-03-10T02:00:00.000Z',
          createdAt: '2026-03-10T00:00:00.000Z',
          teamPoints: 72,
          team: { id: 'team-1', name: 'TSW Blue' },
        },
        {
          id: 'g2',
          title: 'vs Lions',
          opponent: 'Lions',
          scheduledAt: '2026-03-09T00:00:00.000Z',
          completedAt: '2026-03-09T02:00:00.000Z',
          createdAt: '2026-03-09T00:00:00.000Z',
          teamPoints: 61,
          team: { id: 'team-2', name: 'TSW Red' },
        },
      ],
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Explore' })).toBeInTheDocument();
    });

    expect(screen.getByText('TSW Blue')).toBeInTheDocument();
    expect(screen.getByText('TSW Red')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Falcons/i })).toHaveAttribute(
      'href',
      '/games/g1'
    );
    expect(screen.getByRole('link', { name: /Open Lions/i })).toHaveAttribute('href', '/games/g2');
  });

  test('renders explore empty state when no public games are available', async () => {
    teamsApi.listPublicExploreGames.mockResolvedValue({ games: [] });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/No public games to explore yet/i)).toBeInTheDocument();
    });
  });
});
