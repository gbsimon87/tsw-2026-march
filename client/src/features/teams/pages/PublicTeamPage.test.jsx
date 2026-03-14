import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

  test('renders team name, active roster, and split games lists', async () => {
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
              oreb: 2,
              dreb: 4,
              reb: 6,
              points: 23,
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
              oreb: 1,
              dreb: 5,
              reb: 6,
              points: 2,
            },
          ],
          teamTotals: {
            ftm: 8,
            fta: 11,
            fg2m: 20,
            fg2a: 32,
            fg3m: 8,
            fg3a: 18,
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

    const rosterSection = screen.getByRole('heading', { name: 'Roster' }).closest('section');
    expect(rosterSection).not.toBeNull();
    const roster = within(rosterSection);

    expect(roster.getByText('#12 Alex Carter')).toBeInTheDocument();
    expect(roster.getByText('Jordan Lee')).toBeInTheDocument();
    expect(roster.getByText('23 pts • 6 reb')).toBeInTheDocument();
    expect(roster.getByText('2 pts • 6 reb')).toBeInTheDocument();
    expect(screen.getByText('Completed Public Games')).toBeInTheDocument();
    expect(screen.getByText('FT')).toBeInTheDocument();
    expect(screen.getByText('2PT')).toBeInTheDocument();
    expect(screen.getByText('3PT')).toBeInTheDocument();
    expect(screen.getByText('OREB')).toBeInTheDocument();
    expect(screen.getByText('DREB')).toBeInTheDocument();
    expect(screen.getByText('REB')).toBeInTheDocument();
    expect(screen.getByText('PTS')).toBeInTheDocument();
    expect(screen.getByText('4/6')).toBeInTheDocument();
    expect(screen.getByText('5/7')).toBeInTheDocument();
    expect(screen.getByText('3/5')).toBeInTheDocument();
    expect(screen.getByText('Team Total')).toBeInTheDocument();
    const headerCells = within(screen.getByRole('table')).getAllByRole('columnheader');
    expect(headerCells.map((cell) => cell.textContent)).toEqual([
      'Player',
      'FT',
      '2PT',
      '3PT',
      'OREB',
      'DREB',
      'REB',
      'PTS',
    ]);
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.getByText(/72 pts/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open details for Falcons/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open details for Hawks/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open details for Lions/i })).not.toBeInTheDocument();
  });

  test('renders empty states', async () => {
    teamsApi.getPublicById.mockResolvedValue({
      team: {
        id: 'team-1',
        name: 'TSW Varsity',
        players: [],
      },
      summary: {
        gamesCount: 0,
        points: 0,
        fg2: { made: 0, missed: 0, attempts: 0, percentage: null },
        fg3: { made: 0, missed: 0, attempts: 0, percentage: null },
        ft: { made: 0, missed: 0, attempts: 0, percentage: null },
        boxScore: {
          players: [],
          teamTotals: {
            ftm: 0,
            fta: 0,
            fg2m: 0,
            fg2a: 0,
            fg3m: 0,
            fg3a: 0,
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
      expect(screen.getByText(/No active players listed yet/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/No upcoming games scheduled/i)).toBeInTheDocument();
    expect(screen.getByText(/No recent games yet/i)).toBeInTheDocument();
    expect(screen.getByText('Team Total')).toBeInTheDocument();
    expect(screen.getAllByText('0/0')).toHaveLength(3);
  });

  test('renders error state', async () => {
    teamsApi.getPublicById.mockRejectedValue(new Error('Team not found'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Team not found/i)).toBeInTheDocument();
    });
  });
});
