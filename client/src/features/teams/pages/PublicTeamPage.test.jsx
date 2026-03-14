import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PublicTeamPage } from './PublicTeamPage';
import { teamsApi } from '../api/teamsApi';

vi.mock('../api/teamsApi', () => ({
  teamsApi: {
    getPublicById: vi.fn(),
  },
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/teams/team-1']}>
      <Routes>
        <Route path="/teams/:teamId" element={<PublicTeamPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PublicTeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test('renders team name, sortable player table, and stacked games lists', async () => {
    teamsApi.getPublicById.mockResolvedValue({
      team: {
        id: 'team-1',
        name: 'TSW Varsity',
        players: [
          { id: 'p1', displayName: 'Alex Carter', jerseyNumber: 12 },
          { id: 'p2', displayName: 'Jordan Lee', jerseyNumber: null },
        ],
      },
      summary: {
        gamesCount: 1,
        points: 72,
        fg2: { made: 20, missed: 12, attempts: 32, percentage: 62.5 },
        fg3: { made: 8, missed: 10, attempts: 18, percentage: 44.444 },
        ft: { made: 8, missed: 3, attempts: 11, percentage: 72.727 },
        boxScore: {
          players: [
            {
              playerId: 'p1',
              displayName: 'Alex Carter',
              ftm: 4,
              fta: 6,
              fg2m: 5,
              fg2a: 7,
              fg3m: 3,
              fg3a: 5,
              ast: 4,
              oreb: 2,
              dreb: 4,
              reb: 6,
              points: 23,
              gamesPlayed: 1,
              pointsPerGame: 23,
              assistsPerGame: 4,
              reboundsPerGame: 6,
            },
            {
              playerId: 'p2',
              displayName: 'Jordan Lee',
              ftm: 0,
              fta: 0,
              fg2m: 1,
              fg2a: 3,
              fg3m: 0,
              fg3a: 1,
              ast: 2,
              oreb: 1,
              dreb: 5,
              reb: 6,
              points: 2,
              gamesPlayed: 1,
              pointsPerGame: 2,
              assistsPerGame: 2,
              reboundsPerGame: 6,
            },
          ],
          teamTotals: {
            ftm: 8,
            fta: 11,
            fg2m: 20,
            fg2a: 32,
            fg3m: 8,
            fg3a: 18,
            ast: 14,
            oreb: 9,
            dreb: 22,
            reb: 31,
            points: 72,
          },
        },
      },
      games: [
        {
          id: 'g1',
          title: 'vs Falcons',
          opponent: 'Falcons',
          status: 'completed',
          scheduledAt: '2026-03-10T00:00:00.000Z',
          completedAt: '2026-03-10T02:00:00.000Z',
          teamPoints: 72,
          isPubliclyViewable: true,
          createdAt: '2026-03-10T00:00:00.000Z',
        },
        {
          id: 'g2',
          title: 'vs Hawks',
          opponent: 'Hawks',
          status: 'in_progress',
          scheduledAt: '2026-03-11T00:00:00.000Z',
          completedAt: null,
          teamPoints: null,
          isPubliclyViewable: true,
          createdAt: '2026-03-11T00:00:00.000Z',
        },
        {
          id: 'g3',
          title: 'vs Tigers',
          opponent: 'Tigers',
          status: 'completed',
          scheduledAt: '2026-03-09T00:00:00.000Z',
          completedAt: '2026-03-09T02:00:00.000Z',
          teamPoints: 68,
          isPubliclyViewable: true,
          createdAt: '2026-03-09T00:00:00.000Z',
        },
        {
          id: 'g4',
          title: 'vs Panthers',
          opponent: 'Panthers',
          status: 'completed',
          scheduledAt: '2026-03-08T00:00:00.000Z',
          completedAt: '2026-03-08T02:00:00.000Z',
          teamPoints: 65,
          isPubliclyViewable: true,
          createdAt: '2026-03-08T00:00:00.000Z',
        },
        {
          id: 'g5',
          title: 'vs Bears',
          opponent: 'Bears',
          status: 'completed',
          scheduledAt: '2026-03-07T00:00:00.000Z',
          completedAt: '2026-03-07T02:00:00.000Z',
          teamPoints: 70,
          isPubliclyViewable: true,
          createdAt: '2026-03-07T00:00:00.000Z',
        },
        {
          id: 'g6',
          title: 'vs Wolves',
          opponent: 'Wolves',
          status: 'completed',
          scheduledAt: '2026-03-06T00:00:00.000Z',
          completedAt: '2026-03-06T02:00:00.000Z',
          teamPoints: 74,
          isPubliclyViewable: true,
          createdAt: '2026-03-06T00:00:00.000Z',
        },
        {
          id: 'g7',
          title: 'vs Lions',
          opponent: 'Lions',
          status: 'in_progress',
          scheduledAt: '2099-03-10T00:00:00.000Z',
          completedAt: null,
          teamPoints: null,
          isPubliclyViewable: false,
          createdAt: '2026-03-11T00:00:00.000Z',
        },
        {
          id: 'g8',
          title: 'vs Lions',
          opponent: 'Lions',
          status: 'in_progress',
          scheduledAt: '2099-03-10T00:00:00.000Z',
          completedAt: null,
          teamPoints: null,
          isPubliclyViewable: false,
          createdAt: '2026-03-11T00:00:00.000Z',
        },
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('TSW Varsity')).toBeInTheDocument();
    });

    expect(screen.queryByRole('heading', { name: 'Roster' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alex Carter' })).toHaveAttribute(
      'href',
      '/teams/team-1/players/p1'
    );
    expect(screen.getByRole('link', { name: 'Alex Carter' }).className).toContain('underline');
    expect(screen.getByRole('link', { name: 'Jordan Lee' })).toHaveAttribute(
      'href',
      '/teams/team-1/players/p2'
    );
    expect(screen.getByText('Completed Public Games')).toBeInTheDocument();
    expect(screen.getByText('GP')).toBeInTheDocument();
    expect(screen.getByText('PPG')).toBeInTheDocument();
    expect(screen.getByText('PTS')).toBeInTheDocument();
    expect(screen.getByText('APG')).toBeInTheDocument();
    expect(screen.getByText('REB')).toBeInTheDocument();
    expect(screen.getByText('RPG')).toBeInTheDocument();
    expect(screen.getByText('2PT')).toBeInTheDocument();
    expect(screen.getByText('3PT')).toBeInTheDocument();
    expect(screen.getByText('FT')).toBeInTheDocument();
    expect(screen.getByText('AST')).toBeInTheDocument();
    expect(screen.getByText('OREB')).toBeInTheDocument();
    expect(screen.getByText('DREB')).toBeInTheDocument();
    expect(screen.getByText('23.0')).toBeInTheDocument();
    expect(screen.getByText('4.0')).toBeInTheDocument();
    expect(screen.getByText('4/6')).toBeInTheDocument();
    expect(screen.getByText('5/7')).toBeInTheDocument();
    expect(screen.getByText('3/5')).toBeInTheDocument();
    const headerCells = within(screen.getByRole('table')).getAllByRole('columnheader');
    expect(headerCells.map((cell) => cell.textContent.replace(/[↕▲▼]/g, '').trim())).toEqual([
      'Player',
      'GP',
      'PPG',
      'PTS',
      'APG',
      'AST',
      'RPG',
      'REB',
      'OREB',
      'DREB',
      'FT',
      '2PT',
      '3PT',
    ]);
    const gamesHeading = screen.getByRole('heading', { name: 'Games' });
    const gamesSection = gamesHeading.closest('section');
    const headings = within(gamesSection).getAllByRole('heading', { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual(['Upcoming', 'Recent']);
    expect(screen.getByText(/72 pts/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open details for Falcons/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open details for Hawks/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open details for Lions/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Open details for Wolves/i })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /PTS/i }));
    const rowsAfterSort = within(screen.getByRole('table')).getAllByRole('row');
    expect(within(rowsAfterSort[1]).getByRole('link', { name: 'Alex Carter' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show all/i }));
    expect(screen.getByRole('link', { name: /Open details for Wolves/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show fewer/i }));
    expect(
      screen.queryByRole('link', { name: /Open details for Wolves/i })
    ).not.toBeInTheDocument();
  });

  test('renders empty states', async () => {
    teamsApi.getPublicById.mockResolvedValue({
      team: {
        id: 'team-1',
        name: 'TSW Varsity',
        players: [{ id: 'p1', displayName: 'Alex Carter', jerseyNumber: 12 }],
      },
      summary: {
        gamesCount: 0,
        points: 0,
        fg2: { made: 0, missed: 0, attempts: 0, percentage: null },
        fg3: { made: 0, missed: 0, attempts: 0, percentage: null },
        ft: { made: 0, missed: 0, attempts: 0, percentage: null },
        boxScore: {
          players: [
            {
              playerId: 'p1',
              displayName: 'Alex Carter',
              ftm: 0,
              fta: 0,
              fg2m: 0,
              fg2a: 0,
              fg3m: 0,
              fg3a: 0,
              ast: 0,
              oreb: 0,
              dreb: 0,
              reb: 0,
              points: 0,
              gamesPlayed: 0,
              pointsPerGame: 0,
              assistsPerGame: 0,
              reboundsPerGame: 0,
            },
          ],
          teamTotals: {
            ftm: 0,
            fta: 0,
            fg2m: 0,
            fg2a: 0,
            fg3m: 0,
            fg3a: 0,
            ast: 0,
            oreb: 0,
            dreb: 0,
            reb: 0,
            points: 0,
          },
        },
      },
      games: [],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Alex Carter' })).toBeInTheDocument();
    });

    expect(screen.getByText(/No upcoming games scheduled/i)).toBeInTheDocument();
    expect(screen.getByText(/No recent games yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Roster' })).not.toBeInTheDocument();
    expect(screen.getAllByText('0/0')).toHaveLength(3);
    expect(screen.getAllByText('0.0').length).toBeGreaterThanOrEqual(3);
  });

  test('renders error state', async () => {
    teamsApi.getPublicById.mockRejectedValue(new Error('Team not found'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Team not found/i)).toBeInTheDocument();
    });
  });
});
