import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HomePage } from './HomePage';
import { teamsApi } from '../features/teams/api/teamsApi';
import { leaguesApi } from '../features/leagues/api/leaguesApi';

vi.mock('../app/store/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));

vi.mock('../features/teams/api/teamsApi', () => ({
  teamsApi: {
    listPublicExploreGames: vi.fn(),
    listPublic: vi.fn(),
  },
}));

vi.mock('../features/leagues/api/leaguesApi', () => ({
  leaguesApi: {
    listPublic: vi.fn(),
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
    teamsApi.listPublic.mockResolvedValue({
      teams: [{ id: 'team-1', name: 'TSW Blue', logo: null }],
    });
    leaguesApi.listPublic.mockResolvedValue({
      leagues: [
        {
          id: 'league-1',
          name: 'Spring League',
          slug: 'spring-league',
          seasonLabel: 'Spring 2026',
          isPublic: true,
          status: 'active',
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

    expect(screen.getByRole('link', { name: 'TSW Blue' })).toHaveAttribute('href', '/teams/team-1');
    expect(screen.getByRole('link', { name: 'TSW Red' })).toHaveAttribute('href', '/teams/team-2');
    expect(screen.getByRole('link', { name: /Open Falcons/i })).toHaveAttribute(
      'href',
      '/games/g1'
    );
    expect(screen.getByRole('link', { name: /Open Lions/i })).toHaveAttribute('href', '/games/g2');
    expect(screen.getByRole('heading', { name: 'Active Leagues' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Featured Public Teams' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/league/spring-league'
    );
  });

  test('renders explore empty state when no public games are available', async () => {
    teamsApi.listPublicExploreGames.mockResolvedValue({ games: [] });
    teamsApi.listPublic.mockResolvedValue({ teams: [] });
    leaguesApi.listPublic.mockResolvedValue({ leagues: [] });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/No public games to explore yet/i)).toBeInTheDocument();
    });
  });

  test('renders the three homepage audience images', async () => {
    teamsApi.listPublicExploreGames.mockResolvedValue({ games: [] });
    teamsApi.listPublic.mockResolvedValue({ teams: [] });
    leaguesApi.listPublic.mockResolvedValue({ leagues: [] });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByRole('img', { name: /players reviewing basketball progress and development/i })
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole('img', {
        name: /coaches and managers using basketball performance insights/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: /friends and family following basketball team highlights/i,
      })
    ).toBeInTheDocument();
  });
});
