import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AppRouter, signedOutDestination } from './AppRouter';

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

vi.mock('../../features/scrimmages/pages/ScrimmagePages', () => ({
  ScrimmagePage: ({ adminMode }) => <p>{adminMode ? 'Admin scrimmage' : 'Public scrimmage'}</p>,
  ScrimmageSessionPage: ({ adminMode }) => (
    <p>{adminMode ? 'Admin weekly session' : 'Public weekly session'}</p>
  ),
  ScrimmageAdminListPage: () => <p>Scrimmage creation</p>,
}));
vi.mock('../../features/scrimmages/pages/ScrimmagePlayerPage', () => ({
  ScrimmagePlayerPage: ({ adminMode }) => (
    <p>{adminMode ? 'Admin scrimmage player' : 'Public scrimmage player'}</p>
  ),
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

  test.each([
    ['/scrimmages/s1?seasonId=season-2', '/scrimmage/s1?seasonId=season-2', 'Public scrimmage'],
    [
      '/scrimmages/s1/players/p1?sessionId=w1',
      '/scrimmage/s1/players/p1?sessionId=w1',
      'Public scrimmage player',
    ],
    ['/scrimmages/s1/sessions/w1', '/scrimmage/s1/sessions/w1', 'Public weekly session'],
  ])(
    'redirects old scrimmage URL %s without losing filters',
    async (oldPath, canonicalPath, label) => {
      authMocks.useAuth.mockReturnValue({ user: null, isLoading: false });
      renderWithProviders(
        <MemoryRouter initialEntries={[oldPath]}>
          <AppRouter />
          <LocationProbe />
        </MemoryRouter>
      );
      expect(await screen.findByText(label)).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent(canonicalPath);
    }
  );

  test('requires login for the admin scrimmage URL and preserves the destination', async () => {
    authMocks.useAuth.mockReturnValue({ user: null, isLoading: false });
    renderWithProviders(
      <MemoryRouter initialEntries={['/admin/scrimmage/s1?tab=players']}>
        <AppRouter />
        <LocationProbe />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/login?redirectTo=%2Fadmin%2Fscrimmage%2Fs1%3Ftab%3Dplayers'
      )
    );
  });

  test.each([
    ['/admin/scrimmage/s1', 'Admin scrimmage'],
    ['/admin/scrimmage/s1/players/p1', 'Admin scrimmage player'],
    ['/admin/scrimmage/s1/sessions/w1', 'Admin weekly session'],
  ])('renders admin mode on %s', async (path, label) => {
    authMocks.useAuth.mockReturnValue({ user: { id: 'user-1' }, isLoading: false });
    renderWithProviders(
      <MemoryRouter initialEntries={[path]}>
        <AppRouter />
      </MemoryRouter>
    );
    expect(await screen.findByText(label)).toBeInTheDocument();
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

  test('renders the public pricing route so checkout is reachable', async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 'user-1', name: 'Alex' }, isLoading: false });

    renderWithProviders(
      <MemoryRouter initialEntries={['/pricing']}>
        <AppRouter />
        <LocationProbe />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Teams track for free\. Leagues pay to run the competition\./i)
      ).toBeInTheDocument();
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

  test('redirects an ordinary user away from platform Instagram operations', async () => {
    authMocks.useAuth.mockReturnValue({
      user: { id: 'user-1', name: 'Alex', roles: ['user'] },
      isLoading: false,
    });

    renderWithProviders(
      <MemoryRouter initialEntries={['/admin/social/instagram']}>
        <AppRouter />
        <LocationProbe />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/admin');
    });
  });

  test('logged-out pulse fab routes to register with compose redirect', async () => {
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
      expect(screen.getAllByRole('button', { name: 'Create account' }).length).toBeGreaterThan(0);
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/register?redirectTo=%2Fpulse%3Fcompose%3D1'
      );
    });
  });
});

// Social backlog rank 5: the "login dead end" the item names. A gated route
// used to send every signed-out visitor to a bare `/login`, losing where they
// were going and showing a login form to people who have no account.
describe('signedOutDestination', () => {
  test('carries the intended destination through sign-in', () => {
    expect(signedOutDestination('/teams', '', false)).toBe('/login?redirectTo=%2Fteams');
    expect(signedOutDestination('/admin/leagues/l1', '?tab=roster', false)).toBe(
      '/login?redirectTo=%2Fadmin%2Fleagues%2Fl1%3Ftab%3Droster'
    );
  });

  test('offers registration to a visitor who arrived from a social post', () => {
    expect(signedOutDestination('/teams', '', true)).toBe('/register?redirectTo=%2Fteams');
  });

  test('refuses to carry an off-site destination', () => {
    // safeInternalPath rejects protocol-relative and backslash-smuggled forms,
    // so a crafted path degrades to the plain form rather than an open redirect.
    expect(signedOutDestination('//evil.example', '', false)).toBe('/login');
    expect(signedOutDestination('/\\evil.example', '', false)).toBe('/login');
  });
});
