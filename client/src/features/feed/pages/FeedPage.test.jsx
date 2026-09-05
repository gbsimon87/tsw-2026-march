import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { FeedPage } from './FeedPage';
import { takePendingInstagramDraft } from '../../social/instagramDraftHandoff';

function withQueryClient(children) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const apiMocks = vi.hoisted(() => ({
  listFeed: vi.fn(),
  deletePost: vi.fn(),
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

const signupEventMocks = vi.hoisted(() => ({
  trackSignupCtaClicked: vi.fn(),
  SIGNUP_SOURCE: {
    PULSE: 'pulse',
    FEED_COMPOSER: 'feed_composer',
  },
}));

vi.mock('../api/feedApi', () => ({
  feedApi: apiMocks,
}));

vi.mock('../../../app/store/AuthContext', () => ({
  useAuth: authMocks.useAuth,
}));

vi.mock('../../analytics/signupEvents', () => signupEventMocks);

// The Instagram hand-off renders a PNG through html2canvas, which needs a real
// canvas. Only the File it produces matters to this page.
const shareMocks = vi.hoisted(() => ({ createImageFile: vi.fn(), shareImage: vi.fn() }));
vi.mock('../hooks/useShareImage', () => ({
  useShareImage: () => ({ ...shareMocks, status: 'idle' }),
}));

describe('FeedPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.listFeed.mockResolvedValue({
      posts: [
        {
          id: 'post-1',
          type: 'team_card',
          caption: 'Strong team night.',
          createdAt: '2026-03-10T00:00:00.000Z',
          creator: { id: 'user-1', name: 'Alex' },
          canDelete: true,
          image: null,
          gameCard: null,
          playerCard: null,
          teamCard: {
            teamId: 'team-1',
            teamName: 'TSW Blue',
            teamLogo: { url: 'https://example.com/team-logo.png', width: 128, height: 128 },
            teamUrl: '/teams/team-1',
            summary: {
              gamesCount: 12,
              points: 88,
              fg2: { percentage: 50 },
              fg3: { percentage: 40 },
              ft: { percentage: 75 },
            },
          },
        },
      ],
      nextCursor: null,
    });
    apiMocks.listShareableGames.mockResolvedValue({ games: [] });
    apiMocks.listShareablePlayers.mockResolvedValue({ players: [] });
    apiMocks.listShareableTeams.mockResolvedValue({ teams: [] });
  });

  afterEach(() => {
    cleanup();
    takePendingInstagramDraft();
  });

  function mockGameCardFeed() {
    apiMocks.listFeed.mockResolvedValue({
      posts: [
        {
          id: '507f1f77bcf86cd799439011',
          type: 'game_card',
          caption: 'Demo final score.',
          createdAt: '2026-03-10T00:00:00.000Z',
          creator: { id: 'user-1', name: 'Alex' },
          canDelete: false,
          image: null,
          playerCard: null,
          teamCard: null,
          gameCard: {
            gameUrl: '/games/g1',
            teamName: 'TSW Blue',
            opponent: 'Falcons',
            teamColors: [],
            recap: {
              playedAt: '2026-03-10T00:00:00.000Z',
              statusLabel: 'Final',
              team: { name: 'TSW Blue', points: 70 },
              opponent: { name: 'Falcons', points: 61 },
              teamStats: { points: 70, reb: 10, ast: 12 },
              topPerformers: [],
            },
          },
        },
      ],
      nextCursor: null,
    });
  }

  test('routes logged-out composer action to register', async () => {
    authMocks.useAuth.mockReturnValue({ user: null });

    render(
      withQueryClient(
        <MemoryRouter initialEntries={['/pulse']}>
          <Routes>
            <Route path="/pulse" element={<FeedPage />} />
            <Route path="/register" element={<div>Register page</div>} />
          </Routes>
        </MemoryRouter>
      )
    );

    await waitFor(() => {
      expect(screen.getAllByAltText('TSW Blue card logo')[0]).toBeInTheDocument();
    });

    // The off-screen ShareableCardExport labels its own logo "share card
    // logo", so this alt text belongs to the visible card alone.
    expect(screen.getAllByAltText('TSW Blue card logo')).toHaveLength(1);

    expect(screen.getByAltText('TSW Blue card logo')).toHaveAttribute(
      'src',
      'https://example.com/team-logo.png'
    );
    expect(screen.getByAltText('TSW Blue share card logo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create post' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'post-submit' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create post' }));

    expect(signupEventMocks.trackSignupCtaClicked).toHaveBeenCalledWith('feed_composer');

    await waitFor(() => {
      expect(screen.getByText('Register page')).toBeInTheDocument();
    });
  });

  test('offers and tracks the dedicated Pulse signup CTA', async () => {
    authMocks.useAuth.mockReturnValue({ user: null });

    render(
      withQueryClient(
        <MemoryRouter initialEntries={['/pulse']}>
          <Routes>
            <Route path="/pulse" element={<FeedPage />} />
            <Route path="/register" element={<div>Register page</div>} />
          </Routes>
        </MemoryRouter>
      )
    );

    const joinLink = await screen.findByRole('link', { name: 'Join The Sporty Way' });
    fireEvent.click(joinLink);

    expect(signupEventMocks.trackSignupCtaClicked).toHaveBeenCalledWith('pulse');
    expect(await screen.findByText('Register page')).toBeInTheDocument();
  });

  test('shows modal composer and delete button when logged in', async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 'user-1', name: 'Alex' } });
    apiMocks.deletePost.mockResolvedValue({ deleted: true });

    render(
      withQueryClient(
        <MemoryRouter>
          <FeedPage />
        </MemoryRouter>
      )
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create post' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Post' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create post' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'post-submit' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(apiMocks.deletePost).toHaveBeenCalledWith('post-1');
    });
  });

  test('hides the Instagram hand-off from users without the operator role', async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 'user-1', name: 'Alex', roles: ['user'] } });
    mockGameCardFeed();

    render(
      withQueryClient(
        <MemoryRouter>
          <FeedPage />
        </MemoryRouter>
      )
    );

    expect(await screen.findByRole('button', { name: 'Share as image' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Prepare for Instagram' })).toBeNull();
  });

  test('sends an operator to the Instagram review page with the rendered card', async () => {
    authMocks.useAuth.mockReturnValue({
      user: { id: 'user-1', name: 'Alex', roles: ['user', 'platform_operator'] },
    });
    mockGameCardFeed();
    const file = new File(['png'], 'tsw-blue-tsw.png', { type: 'image/png' });
    shareMocks.createImageFile.mockResolvedValue(file);

    render(
      withQueryClient(
        <MemoryRouter initialEntries={['/pulse']}>
          <Routes>
            <Route path="/pulse" element={<FeedPage />} />
            <Route path="/admin/social/instagram" element={<div>Instagram admin</div>} />
          </Routes>
        </MemoryRouter>
      )
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Prepare for Instagram' }));

    expect(await screen.findByText('Instagram admin')).toBeInTheDocument();
    expect(takePendingInstagramDraft()).toEqual({
      file,
      sourcePostId: '507f1f77bcf86cd799439011',
      sourceLabel: 'TSW Blue vs Falcons',
      caption: 'Demo final score.',
    });
  });

  test('opens composer automatically from compose query param', async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 'user-1', name: 'Alex' } });

    render(
      withQueryClient(
        <MemoryRouter initialEntries={['/pulse?compose=1']}>
          <FeedPage />
        </MemoryRouter>
      )
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'post-submit' })).toBeInTheDocument();
    });
  });
});
