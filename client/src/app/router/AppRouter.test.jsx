import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AppRouter } from './AppRouter';

function renderWithProviders(children) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ user: null, isLoading: false })),
}));

const teamsApiMocks = vi.hoisted(() => ({
  listPublicExploreGames: vi.fn(() => Promise.resolve({ games: [] })),
  listPublic: vi.fn(() => Promise.resolve({ teams: [] })),
  list: vi.fn(() => Promise.resolve({ teams: [] })),
}));

const leaguesApiMocks = vi.hoisted(() => ({
  listPublic: vi.fn(() => Promise.resolve({ leagues: [] })),
  list: vi.fn(() => Promise.resolve({ leagues: [] })),
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

vi.mock('../../features/leagues/api/leaguesApi', () => ({
  leaguesApi: leaguesApiMocks,
}));

vi.mock('../../features/feed/api/feedApi', () => ({
  feedApi: feedApiMocks,
}));

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

describe('AppRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test('redirects logged-out users from root to The Pulse', async () => {
    authMocks.useAuth.mockReturnValue({ user: null, isLoading: false });

    renderWithProviders(
      <MemoryRouter initialEntries={['/']}>
        <AppRouter />
        <LocationProbe />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/pulse');
    });
  });

  test('redirects logged-in users from root to The Pulse', async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 'user-1', name: 'Alex' }, isLoading: false });

    renderWithProviders(
      <MemoryRouter initialEntries={['/']}>
        <AppRouter />
        <LocationProbe />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/pulse');
    });
  });

  test('renders the Discover page at /home regardless of auth state', async () => {
    authMocks.useAuth.mockReturnValue({ user: null, isLoading: false });

    renderWithProviders(
      <MemoryRouter initialEntries={['/home']}>
        <AppRouter />
        <LocationProbe />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Featured Leagues/i)).toBeInTheDocument();
    });

    expect(screen.getByTestId('location')).toHaveTextContent('/home');
  });

  test('renders pricing page in development so league checkout is reachable', async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 'user-1', name: 'Alex' }, isLoading: false });

    renderWithProviders(
      <MemoryRouter initialEntries={['/pricing']}>
        <AppRouter />
        <LocationProbe />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Track for free\. Upgrade for the extras\./i)).toBeInTheDocument();
    });

    expect(screen.getByTestId('location')).toHaveTextContent('/pricing');
  });

  test('redirects legacy /leagues/new to pricing instead of the creation form', async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 'user-1', name: 'Alex' }, isLoading: false });

    renderWithProviders(
      <MemoryRouter initialEntries={['/leagues/new']}>
        <AppRouter />
        <LocationProbe />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/pricing');
    });
  });

  test('renders not found page for unknown routes instead of redirecting home', async () => {
    authMocks.useAuth.mockReturnValue({ user: null, isLoading: false });

    renderWithProviders(
      <MemoryRouter initialEntries={['/some-nonexistent-page']}>
        <AppRouter />
        <LocationProbe />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/page not found/i)).toBeInTheDocument();
    });

    expect(screen.getByTestId('location')).toHaveTextContent('/some-nonexistent-page');
  });

  test('redirects legacy /feed path to /pulse', async () => {
    authMocks.useAuth.mockReturnValue({ user: null, isLoading: false });

    renderWithProviders(
      <MemoryRouter initialEntries={['/feed']}>
        <AppRouter />
        <LocationProbe />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/pulse');
    });
  });

  test('logged-out pulse fab routes to login with compose redirect', async () => {
    authMocks.useAuth.mockReturnValue({ user: null, isLoading: false });

    renderWithProviders(
      <MemoryRouter initialEntries={['/pulse']}>
        <AppRouter />
        <LocationProbe />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create post' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create post' }));

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Log in' }).length).toBeGreaterThan(0);
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/login?redirectTo=%2Fpulse%3Fcompose%3D1'
      );
    });
  });
});
