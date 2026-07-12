import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PublicPlayerPage } from './PublicPlayerPage';
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
    getPublicPlayerById: vi.fn(),
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
    authMocks.useAuth.mockReturnValue({ user: null });
    feedApiMocks.listShareableGames.mockResolvedValue({ games: [] });
    feedApiMocks.listShareablePlayers.mockResolvedValue({ players: [] });
    feedApiMocks.listShareableTeams.mockResolvedValue({ teams: [] });
    feedApiMocks.createPlayerCardPost.mockResolvedValue({ post: { id: 'post-1' } });
  });

  afterEach(() => {
    cleanup();
  });

  test('renders player hero, averages, and game log table', async () => {
    teamsApi.getPublicPlayerById.mockResolvedValue({
      team: {
        id: 'team-1',
        name: 'TSW Varsity',
        logo: { url: 'https://example.com/logo.png' },
        colors: ['#112233', '#d4af37'],
      },
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
      expect(screen.getAllByText('#12 Alex Carter').length).toBeGreaterThanOrEqual(1);
    });

    expect(teamsApi.getPublicPlayerById).toHaveBeenCalledWith('team-1', 'p1');
    // ShareImageButton renders an off-screen ShareableCardExport duplicate of
    // PlayerCardPost for html2canvas capture, so this alt text now appears
    // twice: once in the visible card, once in the hidden export.
    const cardAvatarImages = screen.getAllByAltText('#12 Alex Carter card avatar');
    expect(cardAvatarImages).toHaveLength(2);
    for (const image of cardAvatarImages) {
      expect(image).toHaveAttribute('src', 'https://example.com/logo.png');
    }
    expect(screen.queryByText('Shareable Player Card')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share to The Pulse' })).toBeInTheDocument();
    expect(screen.getByText('PG')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TSW Varsity' })).toHaveAttribute(
      'href',
      '/teams/team-1'
    );
    expect(screen.getAllByText('12.0').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('5.0').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('4.0').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('PPG').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('RPG').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('APG').length).toBeGreaterThanOrEqual(1);
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
      team: { id: 'team-1', name: 'TSW Varsity', logo: null, colors: [] },
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
        stl: 0,
        tov: 0,
        foul: 0,
        pointsPerGame: 0,
        reboundsPerGame: 0,
        assistsPerGame: 0,
        stealsPerGame: 0,
        turnoversPerGame: 0,
        foulsPerGame: 0,
      },
      games: [],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('Alex Carter').length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/No completed public games yet/i)).toBeInTheDocument();
    expect(screen.getAllByText('0.0').length).toBeGreaterThanOrEqual(6);
    expect(screen.getAllByText('0/0')).toHaveLength(3);
  });

  test('renders error state', async () => {
    teamsApi.getPublicPlayerById.mockRejectedValue(new Error('Player not found'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Player not found/i)).toBeInTheDocument();
    });
  });

  test('opens prefilled player composer for logged-in users', async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 'user-1', name: 'Alex' } });
    teamsApi.getPublicPlayerById.mockResolvedValue({
      team: { id: 'team-1', name: 'TSW Varsity', logo: null, colors: [] },
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
      games: [],
    });

    renderPage();

    expect(await screen.findByRole('button', { name: 'Share to The Pulse' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Share to The Pulse' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Player' })).toHaveClass('bg-slate-900');
    expect(screen.getByRole('combobox')).toHaveValue('p1');
  });

  test('redirects logged-out users to login when posting to The Pulse', async () => {
    teamsApi.getPublicPlayerById.mockResolvedValue({
      team: { id: 'team-1', name: 'TSW Varsity', logo: null, colors: [] },
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

    render(
      <MemoryRouter initialEntries={['/teams/team-1/players/p1']}>
        <Routes>
          <Route path="/teams/:teamId/players/:playerId" element={<PublicPlayerPage />} />
          <Route path="/login" element={<p>Login Page</p>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'Share to The Pulse' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Share to The Pulse' }));
    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });
});
