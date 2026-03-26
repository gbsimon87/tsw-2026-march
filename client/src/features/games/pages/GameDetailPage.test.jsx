import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { GameDetailPage } from './GameDetailPage';

const apiMocks = vi.hoisted(() => ({
  getById: vi.fn(),
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

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ user: null })),
}));

vi.mock('../api/gamesApi', () => ({
  gamesApi: apiMocks,
}));

vi.mock('../../feed/api/feedApi', () => ({
  feedApi: feedApiMocks,
}));

vi.mock('../../../app/store/AuthContext', () => ({
  useAuth: authMocks.useAuth,
}));

describe('GameDetailPage', () => {
  function LocationProbe() {
    const location = useLocation();

    return (
      <div data-testid="location-probe">
        {location.pathname}
        {location.search}
      </div>
    );
  }

  beforeEach(() => {
    cleanup();
    apiMocks.getById.mockReset();
    authMocks.useAuth.mockReset();
    authMocks.useAuth.mockReturnValue({ user: null });
    feedApiMocks.listShareableGames.mockResolvedValue({ games: [] });
    feedApiMocks.listShareablePlayers.mockResolvedValue({ players: [] });
    feedApiMocks.listShareableTeams.mockResolvedValue({ teams: [] });
    feedApiMocks.createGameCardPost.mockResolvedValue({
      post: { id: 'post-1', type: 'game_card' },
    });
    global.File = class MockFile {
      constructor(parts, name, options = {}) {
        this.parts = parts;
        this.name = name;
        this.type = options.type;
      }
    };

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      share: vi.fn().mockResolvedValue(undefined),
      canShare: vi.fn(() => true),
    });
  });

  test('renders tabbed game detail sections and shot map interactions', async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 'user-1', name: 'Alex' } });
    apiMocks.getById.mockResolvedValue({
      game: {
        id: 'game-1',
        title: 'vs Wildcats',
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        status: 'completed',
        scheduledAt: '2026-03-12T18:00:00.000Z',
        createdAt: '2026-03-12T17:45:00.000Z',
        completedAt: '2026-03-12T19:20:00.000Z',
        events: [
          {
            id: 'e1',
            playerId: 'p1',
            statType: 'FG2_MADE',
            zoneId: 'PAINT',
            x: 51,
            y: 78,
            occurredAt: '2026-03-12T18:03:00.000Z',
          },
          {
            id: 'e2',
            playerId: 'p2',
            statType: 'AST',
            zoneId: null,
            x: null,
            y: null,
            occurredAt: '2026-03-12T18:03:30.000Z',
          },
          {
            id: 'e3',
            playerId: 'p2',
            statType: 'FG3_MISS',
            zoneId: 'ABOVE_BREAK_THREE',
            x: 24,
            y: 36,
            occurredAt: '2026-03-12T18:04:00.000Z',
          },
          {
            id: 'e4',
            playerId: 'p1',
            statType: 'FT_MADE',
            zoneId: 'FREE_THROW_LINE',
            x: 50,
            y: 20,
            occurredAt: '2026-03-12T18:05:00.000Z',
          },
          {
            id: 'e5',
            playerId: 'p2',
            statType: 'DREB',
            zoneId: null,
            x: null,
            y: null,
            occurredAt: '2026-03-12T18:06:00.000Z',
          },
          {
            id: 'e6',
            playerId: 'p1',
            statType: 'FT_MADE',
            zoneId: 'FREE_THROW_LINE',
            x: 50,
            y: 20,
            occurredAt: '2026-03-12T18:07:00.000Z',
          },
        ],
      },
      team: {
        id: 'team-1',
        name: 'TSW Team',
        logo: { url: 'https://example.com/team-logo.png' },
        billing: {
          plan: 'pro',
          subscriptionStatus: 'active',
        },
        entitlements: {
          canViewReplay: true,
          canViewShotMaps: true,
        },
        players: [
          { id: 'p1', displayName: 'Alex', isActive: true },
          { id: 'p2', displayName: 'Jordan', isActive: true },
        ],
      },
      teamEntitlements: {
        canViewReplay: true,
        canViewShotMaps: true,
      },
      recap: {
        statusLabel: 'Final',
        team: {
          id: 'team-1',
          name: 'TSW Team',
          points: 4,
        },
        opponent: {
          name: 'Wildcats',
        },
        playedAt: '2026-03-12T19:20:00.000Z',
        topPerformers: [
          { playerId: 'p1', displayName: 'Alex', points: 4, reb: 0, ast: 0 },
          { playerId: 'p2', displayName: 'Jordan', points: 0, reb: 1, ast: 1 },
        ],
        teamStats: {
          points: 4,
          fg2: { made: 1, missed: 0, attempts: 1, percentage: 100 },
          fg3: { made: 0, missed: 1, attempts: 1, percentage: 0 },
          ft: { made: 2, missed: 0, attempts: 2, percentage: 100 },
          reb: 1,
          ast: 1,
        },
        keyMoments: [
          {
            eventId: 'e1',
            playerId: 'p1',
            playerName: 'Alex',
            statType: 'FG2_MADE',
            statLabel: '2PT Make',
            occurredAt: '2026-03-12T18:03:00.000Z',
          },
        ],
        shotSnapshot: {
          made: 1,
          missed: 1,
          events: [
            {
              id: 'e1',
              playerId: 'p1',
              playerName: 'Alex',
              statType: 'FG2_MADE',
              zoneId: 'PAINT',
              x: 51,
              y: 78,
            },
            {
              id: 'e3',
              playerId: 'p2',
              playerName: 'Jordan',
              statType: 'FG3_MISS',
              zoneId: 'ABOVE_BREAK_THREE',
              x: 24,
              y: 36,
            },
          ],
        },
      },
      boxScore: {
        players: [
          {
            playerId: 'p1',
            displayName: 'Alex',
            ftm: 2,
            fta: 2,
            fg2m: 1,
            fg2a: 1,
            fg3m: 0,
            fg3a: 0,
            ast: 0,
            oreb: 0,
            dreb: 0,
            reb: 0,
            points: 4,
          },
          {
            playerId: 'p2',
            displayName: 'Jordan',
            ftm: 0,
            fta: 0,
            fg2m: 0,
            fg2a: 0,
            fg3m: 0,
            fg3a: 1,
            ast: 1,
            oreb: 0,
            dreb: 1,
            reb: 1,
            points: 0,
          },
        ],
        teamTotals: {
          ftm: 2,
          fta: 2,
          fg2m: 1,
          fg2a: 1,
          fg3m: 0,
          fg3a: 1,
          ast: 1,
          oreb: 0,
          dreb: 1,
          reb: 1,
          points: 4,
        },
      },
    });

    render(
      <MemoryRouter initialEntries={['/games/game-1']}>
        <Routes>
          <Route path="/games/:gameId" element={<GameDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('tab', { name: 'Recap' })).toBeInTheDocument();

    expect(screen.getByRole('tab', { name: 'Recap' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Stats' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Replay' })).toBeInTheDocument();
    expect(screen.getByTitle('vs Wildcats')).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/dQw4w9WgXcQ'
    );
    expect(screen.queryByRole('tab', { name: 'Game Info' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Share Game Recap/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share image card' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download image card' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share to feed' })).toBeInTheDocument();
    expect(screen.queryByText('Share Card')).not.toBeInTheDocument();
    expect(screen.queryByText('Download Card')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Share on WhatsApp/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Share by Email/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy Link/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /View Team Page/i })).not.toBeInTheDocument();
    expect(screen.getByAltText(/Shareable game recap card preview/i)).toBeInTheDocument();
    expect(screen.getByAltText('TSW Team logo')).toHaveAttribute(
      'src',
      'https://example.com/team-logo.png'
    );
    expect(screen.getAllByText('TSW Team').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Wildcats/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Status: completed/i)).toBeInTheDocument();
    expect(screen.getByText(/Recorded:/i)).toBeInTheDocument();
    expect(screen.getByText(/Finished:/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TSW Team' })).toHaveAttribute('href', '/teams/team-1');
    expect(screen.queryByText(/^Team:/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Top Performer/i).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('link', {
        name: /Top Performer\s+Alex\s+4 PTS • 0 REB • 0 AST/i,
      })
    ).toHaveAttribute('href', '/teams/team-1/players/p1');
    expect(screen.queryByTestId('recap-shot-snapshot')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Share image card' }));
    expect(navigator.share).toHaveBeenCalledTimes(1);
    const sharePayload = navigator.share.mock.calls[0][0];
    expect(sharePayload.url).toContain('/games/game-1');
    expect(sharePayload.text).toContain('TSW Team vs Wildcats final: 4-0');
    expect(sharePayload.files).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Share to feed' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Game' })).toHaveClass('bg-slate-900');
    expect(screen.getByRole('combobox')).toHaveValue('game-1');
    fireEvent.change(screen.getByPlaceholderText('Write a caption (optional)'), {
      target: { value: 'What a finish' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    expect(feedApiMocks.createGameCardPost).toHaveBeenCalledWith({
      gameId: 'game-1',
      caption: 'What a finish',
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(screen.getByTestId('recap-shot-snapshot')).toBeInTheDocument();
    expect(screen.getAllByTestId('recap-shot-made-marker')).toHaveLength(1);
    expect(screen.getAllByTestId('recap-shot-miss-marker')).toHaveLength(1);
    expect(screen.getByText(/Play by Play/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show All' })).toBeInTheDocument();
    expect(screen.queryByText(/Shot Map/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Game Date \/ Time/i)).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole('link', { name: 'Jordan' })
        .some((link) => link.getAttribute('href') === '/teams/team-1/players/p2')
    ).toBe(true);
    expect(screen.getAllByText(/: Assist/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/: Defensive Rebound/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Alex: 2PT Make/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('AST')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PTS/i })).toBeInTheDocument();
    expect(screen.getByText('OREB')).toBeInTheDocument();
    expect(screen.getByText('DREB')).toBeInTheDocument();
    expect(screen.getByText('REB')).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('link', { name: 'Alex' })
        .some((link) => link.getAttribute('href') === '/teams/team-1/players/p1')
    ).toBe(true);
    expect(
      screen
        .getAllByRole('link', { name: 'Jordan' })
        .some((link) => link.getAttribute('href') === '/teams/team-1/players/p2')
    ).toBe(true);
    expect(screen.queryByRole('link', { name: 'Team Total' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('game-shot-map')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shot-zone-overlay')).not.toBeInTheDocument();
    expect(screen.queryByTestId('shot-zone-table')).not.toBeInTheDocument();
    expect(screen.queryByText('Zone Results')).not.toBeInTheDocument();
    expect(screen.queryByText('ABOVE_BREAK_THREE')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show All' }));
    expect(screen.getByRole('button', { name: 'Show Last 5' })).toBeInTheDocument();
    expect(screen.getAllByText(/: 2PT Make/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('listitem')).toHaveLength(6);

    fireEvent.click(screen.getByRole('tab', { name: 'Replay' }));
    expect(screen.getByText('Event 1 of 4')).toBeInTheDocument();
    expect(screen.getAllByTestId('replay-marker')).toHaveLength(1);
    expect(screen.getByTestId('replay-box-score')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Jordan')).toBeInTheDocument();
    expect(screen.getByText('1/1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Event 2 of 4')).toBeInTheDocument();
    expect(screen.getAllByTestId('replay-marker')).toHaveLength(2);
    expect(screen.getByText('0/1')).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId('replay-box-score')).getByRole('button', { name: /AST/i })
    );
    const jordanReplayRowAfterAssist = within(screen.getByTestId('replay-box-score'))
      .getByText('Jordan')
      .closest('tr');
    expect(jordanReplayRowAfterAssist).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Event 3 of 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Event 4 of 4')).toBeInTheDocument();
    const jordanReplayRow = within(screen.getByTestId('replay-box-score'))
      .getByText('Jordan')
      .closest('tr');
    expect(jordanReplayRow).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('tab', { name: 'Stats' }));
    expect(screen.getByText(/Play by Play/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /PTS/i }));
    const boxScoreRows = within(screen.getAllByRole('table')[0]).getAllByRole('row');
    expect(within(boxScoreRows[1]).getByText('Alex')).toBeInTheDocument();
  });

  test('redirects logged-out users to login and preserves the resume share URL', async () => {
    apiMocks.getById.mockResolvedValue({
      game: {
        id: 'game-1',
        title: 'vs Wildcats',
        status: 'completed',
        createdAt: '2026-03-12T17:45:00.000Z',
        completedAt: '2026-03-12T19:20:00.000Z',
        events: [],
      },
      team: {
        id: 'team-1',
        name: 'TSW Team',
        players: [],
        entitlements: { canViewReplay: false, canViewShotMaps: false },
      },
      teamEntitlements: {
        canViewReplay: false,
        canViewShotMaps: false,
      },
      recap: {
        statusLabel: 'Final',
        team: { id: 'team-1', name: 'TSW Team', points: 0 },
        opponent: { name: 'Wildcats' },
        topPerformers: [],
        teamStats: {
          points: 0,
          fg2: { percentage: null },
          fg3: { percentage: null },
          ft: { percentage: null },
          reb: 0,
          ast: 0,
        },
        keyMoments: [],
      },
      boxScore: {
        players: [],
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
    });

    render(
      <MemoryRouter initialEntries={['/games/game-1']}>
        <Routes>
          <Route path="/games/:gameId" element={<GameDetailPage />} />
          <Route
            path="/login"
            element={
              <>
                <p>Login Page</p>
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'Share to feed' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Share to feed' }));
    expect(await screen.findByText('Login Page')).toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/login');
    expect(decodeURIComponent(screen.getByTestId('location-probe').textContent || '')).toContain(
      'redirectTo=/games/game-1?composeFeedGame=1'
    );
  });

  test('locks replay for non-pro teams', async () => {
    apiMocks.getById.mockResolvedValue({
      game: {
        id: 'game-2',
        title: 'vs Wildcats',
        status: 'completed',
        scheduledAt: '2026-03-12T18:00:00.000Z',
        createdAt: '2026-03-12T17:45:00.000Z',
        completedAt: '2026-03-12T19:20:00.000Z',
        events: [],
      },
      team: {
        id: 'team-1',
        name: 'TSW Team',
        billing: {
          plan: 'free',
          subscriptionStatus: 'inactive',
        },
        entitlements: {
          canViewReplay: false,
          canViewShotMaps: false,
        },
        players: [],
      },
      teamEntitlements: {
        canViewReplay: false,
        canViewShotMaps: false,
      },
      recap: {
        statusLabel: 'Final',
        team: {
          id: 'team-1',
          name: 'TSW Team',
          points: 0,
        },
        opponent: {
          name: 'Wildcats',
        },
        playedAt: '2026-03-12T19:20:00.000Z',
        topPerformers: [],
        teamStats: {
          points: 0,
          fg2: { made: 0, missed: 0, attempts: 0, percentage: null },
          fg3: { made: 0, missed: 0, attempts: 0, percentage: null },
          ft: { made: 0, missed: 0, attempts: 0, percentage: null },
          reb: 0,
          ast: 0,
        },
        keyMoments: [],
        shotSnapshot: { made: 0, missed: 0, events: [] },
      },
      boxScore: {
        players: [],
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
    });

    render(
      <MemoryRouter initialEntries={['/games/game-2']}>
        <Routes>
          <Route path="/games/:gameId" element={<GameDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect((await screen.findAllByRole('tab', { name: 'Replay' })).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('tab', { name: 'Replay' })[0]);
    expect(screen.getByText(/Replay is only available for Pro users/i)).toBeInTheDocument();
    expect(screen.queryByTestId('replay-box-score')).not.toBeInTheDocument();
  });

  test('keeps replay locked for a pro user viewing a free team game', async () => {
    authMocks.useAuth.mockReturnValue({
      user: {
        id: 'user-1',
        name: 'Pro Owner',
        plan: 'pro',
      },
    });

    apiMocks.getById.mockResolvedValue({
      game: {
        id: 'game-3',
        title: 'vs Rockets',
        status: 'completed',
        scheduledAt: '2026-03-12T18:00:00.000Z',
        createdAt: '2026-03-12T17:45:00.000Z',
        completedAt: '2026-03-12T19:20:00.000Z',
        events: [],
      },
      team: {
        id: 'team-free',
        name: 'Free Team',
        billing: {
          plan: 'free',
          subscriptionStatus: 'inactive',
        },
        entitlements: {
          canViewReplay: false,
          canViewShotMaps: false,
        },
        players: [],
      },
      teamEntitlements: {
        canViewReplay: false,
        canViewShotMaps: false,
      },
      recap: {
        statusLabel: 'Final',
        team: {
          id: 'team-free',
          name: 'Free Team',
          points: 0,
        },
        opponent: {
          name: 'Rockets',
        },
        playedAt: '2026-03-12T19:20:00.000Z',
        topPerformers: [],
        teamStats: {
          points: 0,
          fg2: { made: 0, missed: 0, attempts: 0, percentage: null },
          fg3: { made: 0, missed: 0, attempts: 0, percentage: null },
          ft: { made: 0, missed: 0, attempts: 0, percentage: null },
          reb: 0,
          ast: 0,
        },
        keyMoments: [],
        shotSnapshot: { made: 0, missed: 0, events: [] },
      },
      boxScore: {
        players: [],
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
    });

    render(
      <MemoryRouter initialEntries={['/games/game-3']}>
        <Routes>
          <Route path="/games/:gameId" element={<GameDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect((await screen.findAllByRole('tab', { name: 'Replay' })).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('tab', { name: 'Replay' })[0]);
    expect(screen.getByText(/Replay is only available for Pro users/i)).toBeInTheDocument();
    expect(screen.queryByTestId('replay-box-score')).not.toBeInTheDocument();
  });

  test('renders a simplified print mode layout', async () => {
    apiMocks.getById.mockResolvedValue({
      game: {
        id: 'game-1',
        title: 'vs Wildcats',
        opponent: 'Wildcats',
        status: 'completed',
        scheduledAt: '2026-03-12T18:00:00.000Z',
        createdAt: '2026-03-12T17:45:00.000Z',
        completedAt: '2026-03-12T19:20:00.000Z',
        events: [],
      },
      team: {
        id: 'team-1',
        name: 'TSW Team',
        logo: { url: 'https://example.com/team-logo.png' },
        billing: {
          plan: 'pro',
          subscriptionStatus: 'active',
        },
        entitlements: {
          canViewReplay: true,
          canViewShotMaps: true,
        },
        players: [
          { id: 'p1', displayName: 'Alex', isActive: true },
          { id: 'p2', displayName: 'Jordan', isActive: true },
        ],
      },
      teamEntitlements: {
        canViewReplay: true,
        canViewShotMaps: true,
      },
      recap: {
        statusLabel: 'Final',
        team: {
          id: 'team-1',
          name: 'TSW Team',
          points: 54,
        },
        opponent: {
          name: 'Wildcats',
        },
        playedAt: '2026-03-12T19:20:00.000Z',
      },
      boxScore: {
        players: [
          {
            playerId: 'p1',
            displayName: 'Alexandria Montgomery-Santiago the Third',
            ftm: 2,
            fta: 2,
            fg2m: 4,
            fg2a: 7,
            fg3m: 1,
            fg3a: 3,
            ast: 5,
            oreb: 1,
            dreb: 4,
            reb: 5,
            points: 13,
            stl: 2,
            tov: 1,
            foul: 2,
          },
        ],
        teamTotals: {
          ftm: 8,
          fta: 10,
          fg2m: 15,
          fg2a: 28,
          fg3m: 4,
          fg3a: 12,
          ast: 11,
          oreb: 6,
          dreb: 18,
          reb: 24,
          points: 54,
          stl: 7,
          tov: 9,
          foul: 12,
        },
        opponentTotals: {
          points: 47,
        },
      },
      gameSummary: {
        teamPoints: 54,
        opponentPoints: 47,
        hasOpponentScore: true,
      },
    });

    render(
      <MemoryRouter initialEntries={['/games/game-1?print=1']}>
        <Routes>
          <Route path="/games/:gameId" element={<GameDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Printable Box Score/i)).toBeInTheDocument();
    expect(screen.getByText(/Final Score/i)).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Recap/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Play by Play/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Print$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exit Print View/i })).toBeInTheDocument();
    expect(screen.getByText('Alexandria Montgomery-Santiago the Third')).toBeInTheDocument();
    expect(screen.getByText('Team Total')).toBeInTheDocument();
  });
});
