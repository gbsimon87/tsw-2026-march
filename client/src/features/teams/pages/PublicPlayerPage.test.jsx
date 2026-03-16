import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PublicPlayerPage } from './PublicPlayerPage';
import { teamsApi } from '../api/teamsApi';

vi.mock('../api/teamsApi', () => ({
  teamsApi: {
    getPublicPlayerById: vi.fn(),
  },
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/teams/team-1/players/p1']}>
      <Routes>
        <Route path="/teams/:teamId/players/:playerId" element={<PublicPlayerPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PublicPlayerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test('renders player hero, averages, and game log table', async () => {
    teamsApi.getPublicPlayerById.mockResolvedValue({
      team: { id: 'team-1', name: 'TSW Varsity', logo: { url: 'https://example.com/logo.png' } },
      player: {
        id: 'p1',
        displayName: 'Alex Carter',
        jerseyNumber: 12,
        position: 'PG',
        image: null,
      },
      summary: {
        gamesCount: 2,
        points: 24,
        reb: 10,
        ast: 8,
        pointsPerGame: 12,
        reboundsPerGame: 5,
        assistsPerGame: 4,
      },
      games: [
        {
          gameId: 'g2',
          opponent: 'Hawks',
          opponentDestination: {
            kind: 'team',
            href: '/teams/team-2',
            teamId: 'team-2',
            opponentSlug: null,
          },
          title: 'vs Hawks',
          date: '2026-03-12T00:00:00.000Z',
          scheduledAt: '2026-03-12T00:00:00.000Z',
          completedAt: '2026-03-12T02:00:00.000Z',
          createdAt: '2026-03-12T00:00:00.000Z',
          stats: {
            ftm: 2,
            fta: 2,
            fg2m: 3,
            fg2a: 5,
            fg3m: 1,
            fg3a: 3,
            ast: 5,
            oreb: 1,
            dreb: 4,
            reb: 5,
            points: 11,
          },
        },
        {
          gameId: 'g1',
          opponent: 'Falcons',
          opponentDestination: {
            kind: 'opponent_placeholder',
            href: '/opponents/falcons',
            teamId: null,
            opponentSlug: 'falcons',
          },
          title: 'vs Falcons',
          date: '2026-03-10T00:00:00.000Z',
          scheduledAt: '2026-03-10T00:00:00.000Z',
          completedAt: '2026-03-10T02:00:00.000Z',
          createdAt: '2026-03-10T00:00:00.000Z',
          stats: {
            ftm: 4,
            fta: 6,
            fg2m: 5,
            fg2a: 7,
            fg3m: 0,
            fg3a: 2,
            ast: 3,
            oreb: 2,
            dreb: 3,
            reb: 5,
            points: 13,
          },
        },
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('#12 Alex Carter')).toBeInTheDocument();
    });

    expect(teamsApi.getPublicPlayerById).toHaveBeenCalledWith('team-1', 'p1');
    expect(screen.getByAltText('Alex Carter profile')).toHaveAttribute(
      'src',
      'https://example.com/logo.png'
    );
    expect(screen.getByText('PG')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TSW Varsity' })).toHaveAttribute(
      'href',
      '/teams/team-1'
    );
    expect(screen.getByText('12.0')).toBeInTheDocument();
    expect(screen.getByText('5.0')).toBeInTheDocument();
    expect(screen.getByText('4.0')).toBeInTheDocument();
    expect(screen.getByText('PPG').closest('section').querySelector('.grid')).toHaveClass(
      'grid-cols-3'
    );
    expect(screen.getByText('Opponent')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('FT')).toBeInTheDocument();
    expect(screen.getByText('2PT')).toBeInTheDocument();
    expect(screen.getByText('3PT')).toBeInTheDocument();
    expect(screen.getByText('AST')).toBeInTheDocument();
    expect(screen.getByText('OREB')).toBeInTheDocument();
    expect(screen.getByText('DREB')).toBeInTheDocument();
    expect(screen.getByText('REB')).toBeInTheDocument();
    expect(screen.getByText('PTS')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hawks' })).toHaveAttribute('href', '/teams/team-2');
    expect(screen.getByRole('link', { name: 'Falcons' })).toHaveAttribute(
      'href',
      '/opponents/falcons'
    );
    expect(screen.getByText('Totals')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Totals' })).not.toBeInTheDocument();
    expect(screen.getByText('Season')).toBeInTheDocument();
    expect(screen.getByText('6/8')).toBeInTheDocument();
    expect(screen.getByText('8/12')).toBeInTheDocument();
    expect(screen.getByText('1/5')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PTS/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /PTS/i }));
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(within(rows[1]).getByText('Totals')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Date/i }));
    expect(screen.getByRole('button', { name: /Date/i })).toBeInTheDocument();
  });

  test('renders zero-state game log when the player has no completed public games', async () => {
    teamsApi.getPublicPlayerById.mockResolvedValue({
      team: { id: 'team-1', name: 'TSW Varsity', logo: null },
      player: {
        id: 'p1',
        displayName: 'Alex Carter',
        jerseyNumber: null,
        position: null,
        image: null,
      },
      summary: {
        gamesCount: 0,
        points: 0,
        reb: 0,
        ast: 0,
        pointsPerGame: 0,
        reboundsPerGame: 0,
        assistsPerGame: 0,
      },
      games: [],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Alex Carter')).toBeInTheDocument();
    });

    expect(screen.getByText(/No completed public games yet/i)).toBeInTheDocument();
    expect(screen.getAllByText('0.0')).toHaveLength(3);
    expect(screen.getAllByText('0/0')).toHaveLength(3);
  });

  test('renders error state', async () => {
    teamsApi.getPublicPlayerById.mockRejectedValue(new Error('Player not found'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Player not found/i)).toBeInTheDocument();
    });
  });
});
