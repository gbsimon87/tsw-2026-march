import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AppRouter } from './AppRouter';

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ user: null, isLoading: false })),
}));

const teamsApiMocks = vi.hoisted(() => ({
  listPublicExploreGames: vi.fn(() => Promise.resolve({ games: [] })),
}));

const feedApiMocks = vi.hoisted(() => ({
  listFeed: vi.fn(() => Promise.resolve({ posts: [], nextCursor: null })),
  listShareableGames: vi.fn(() => Promise.resolve({ games: [] })),
  listShareablePlayers: vi.fn(() => Promise.resolve({ players: [] })),
  listShareableTeams: vi.fn(() => Promise.resolve({ teams: [] })),
  createImagePost: vi.fn(),
  createGameCardPost: vi.fn(),
  createPlayerCardPost: vi.fn(),
  createTeamCardPost: vi.fn(),
  deletePost: vi.fn(),
}));

vi.mock('../store/AuthContext', () => ({
  useAuth: authMocks.useAuth,
}));

vi.mock('../../app/store/AuthContext', () => ({
  useAuth: authMocks.useAuth,
}));

vi.mock('../../features/teams/api/teamsApi', () => ({
  teamsApi: teamsApiMocks,
}));

vi.mock('../../features/feed/api/feedApi', () => ({
  feedApi: feedApiMocks,
}));

describe('AppRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test('renders home page for logged-out users at root', async () => {
    authMocks.useAuth.mockReturnValue({ user: null, isLoading: false });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRouter />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/TSW Basketball/i)).toBeInTheDocument();
    });
  });

  test('redirects logged-in users from root to feed', async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 'user-1', name: 'Alex' }, isLoading: false });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppRouter />
      </MemoryRouter>
    );
  });

  test('logged-out feed fab routes to login with compose redirect', async () => {
    authMocks.useAuth.mockReturnValue({ user: null, isLoading: false });

    render(
      <MemoryRouter initialEntries={['/feed']}>
        <AppRouter />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create post' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create post' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
      expect(screen.getByText(/Don't have an account/i).querySelector('a')).toHaveAttribute(
        'href',
        '/register?redirectTo=%2Ffeed%3Fcompose%3D1'
      );
    });
  });
});
