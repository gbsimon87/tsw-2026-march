import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { FeedPage } from './FeedPage';

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

vi.mock('../api/feedApi', () => ({
  feedApi: apiMocks,
}));

vi.mock('../../../app/store/AuthContext', () => ({
  useAuth: authMocks.useAuth,
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
  });

  test('routes logged-out composer action to login', async () => {
    authMocks.useAuth.mockReturnValue({ user: null });

    render(
      withQueryClient(
        <MemoryRouter initialEntries={['/pulse']}>
          <Routes>
            <Route path="/pulse" element={<FeedPage />} />
            <Route path="/login" element={<div>Login page</div>} />
          </Routes>
        </MemoryRouter>
      )
    );

    await waitFor(() => {
      expect(screen.getAllByAltText('TSW Blue card logo')[0]).toBeInTheDocument();
    });

    expect(screen.getAllByAltText('TSW Blue card logo')[0]).toHaveAttribute(
      'src',
      'https://example.com/team-logo.png'
    );
    expect(screen.getByRole('button', { name: 'Create post' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create post' }));

    await waitFor(() => {
      expect(screen.getByText('Login page')).toBeInTheDocument();
    });
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
      expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(apiMocks.deletePost).toHaveBeenCalledWith('post-1');
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
      expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
    });
  });
});
