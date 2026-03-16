import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PublicTeamPage } from './PublicTeamPage';
import { teamsApi } from '../api/teamsApi';

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ user: null })),
}));

const feedApiMocks = vi.hoisted(() => ({
  listShareableGames: vi.fn(),
  listShareablePlayers: vi.fn(),
  listShareableTeams: vi.fn(),
  createImagePost: vi.fn(),
  createGameCardPost: vi.fn(),
  createPlayerCardPost: vi.fn(),
  createTeamCardPost: vi.fn(),
}));

vi.mock('../api/teamsApi', () => ({
  teamsApi: {
    getPublicById: vi.fn(),
  },
}));

vi.mock('../../../app/store/AuthContext', () => ({
  useAuth: authMocks.useAuth,
}));

vi.mock('../../feed/api/feedApi', () => ({
  feedApi: feedApiMocks,
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
    authMocks.useAuth.mockReturnValue({ user: null });
    feedApiMocks.listShareableGames.mockResolvedValue({ games: [] });
    feedApiMocks.listShareablePlayers.mockResolvedValue({ players: [] });
    feedApiMocks.listShareableTeams.mockResolvedValue({ teams: [] });
    feedApiMocks.createTeamCardPost.mockResolvedValue({ post: { id: 'post-1' } });
  });

  afterEach(() => {
    cleanup();
  });

  test('renders team name, sortable player table, and stacked games lists', async () => {
    teamsApi.getPublicById.mockResolvedValue({
      team: {
        id: 'team-1',
        name: 'TSW Varsity',
        logo: { url: 'https://example.com/logo.png' },
        colors: ['#112233', '#d4af37'],
        homeVenue: {
          arenaName: 'Main Gym',
          addressLine1: '123 Court St',
          addressLine2: null,
          city: 'Toronto',
          state: 'ON',
          postalCode: 'M5V 1A1',
          country: 'Canada',
        },
        players: [
          { id: 'p1', displayName: 'Alex Carter', jerseyNumber: 12, position: 'PG' },
          { id: 'p2', displayName: 'Jordan Lee', jerseyNumber: null, position: 'C' },
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
              position: 'PG',
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
              position: 'C',
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
      expect(screen.getAllByText('TSW Varsity').length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole('heading', { name: 'Roster' })).not.toBeInTheDocument();
    expect(screen.getByAltText('TSW Varsity logo')).toHaveAttribute(
      'src',
      'https://example.com/logo.png'
    );
    expect(screen.getByText('Shareable Team Card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post to Feed' })).toBeInTheDocument();
    expect(screen.getByText('Main Gym')).toBeInTheDocument();
    expect(screen.getByLabelText('Team colours').children).toHaveLength(2);
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
    expect(screen.getByText('POS')).toBeInTheDocument();
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
      'POS',
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
        logo: null,
        colors: [],
        homeVenue: null,
        players: [{ id: 'p1', displayName: 'Alex Carter', jerseyNumber: 12, position: null }],
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
              position: null,
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

  test('opens prefilled team composer for logged-in users', async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 'user-1', name: 'Alex' } });
    teamsApi.getPublicById.mockResolvedValue({
      team: {
        id: 'team-1',
        name: 'TSW Varsity',
        logo: null,
        colors: [],
        homeVenue: null,
        players: [],
      },
      summary: {
        gamesCount: 1,
        points: 72,
        fg2: { made: 20, missed: 12, attempts: 32, percentage: 62.5 },
        fg3: { made: 8, missed: 10, attempts: 18, percentage: 44.444 },
        ft: { made: 8, missed: 3, attempts: 11, percentage: 72.727 },
        boxScore: { players: [], teamTotals: {} },
      },
      games: [],
    });

    renderPage();

    expect(await screen.findByRole('button', { name: 'Post to Feed' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Post to Feed' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Team' })).toHaveClass('bg-slate-900');
    expect(screen.getByRole('combobox')).toHaveValue('team-1');
  });

  test('redirects logged-out users to login when posting to feed', async () => {
    teamsApi.getPublicById.mockResolvedValue({
      team: {
        id: 'team-1',
        name: 'TSW Varsity',
        logo: null,
        colors: [],
        homeVenue: null,
        players: [],
      },
      summary: {
        gamesCount: 1,
        points: 72,
        fg2: { made: 20, missed: 12, attempts: 32, percentage: 62.5 },
        fg3: { made: 8, missed: 10, attempts: 18, percentage: 44.444 },
        ft: { made: 8, missed: 3, attempts: 11, percentage: 72.727 },
        boxScore: { players: [], teamTotals: {} },
      },
      games: [],
    });

    render(
      <MemoryRouter initialEntries={['/teams/team-1']}>
        <Routes>
          <Route path="/teams/:teamId" element={<PublicTeamPage />} />
          <Route path="/login" element={<p>Login Page</p>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'Post to Feed' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Post to Feed' }));
    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });
});
