import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FollowingPage } from './FollowingPage';
import { followsApi } from '../api/followsApi';

vi.mock('../api/followsApi', () => ({
  followsApi: {
    listFollowing: vi.fn(),
    getStatuses: vi.fn(),
    follow: vi.fn(),
    unfollow: vi.fn(),
  },
}));

// FollowButton (on each card) reads useAuth; the viewer is signed in here.
vi.mock('../../../app/store/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me-1' } }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FollowingPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Route listFollowing per targetType so each section gets its own data.
function mockFollowingByType({ user = [], league = [], leagueTeam = [] }) {
  followsApi.listFollowing.mockImplementation((targetType) => {
    const map = { user, league, leagueTeam };
    return Promise.resolve({ following: map[targetType] || [], nextCursor: null });
  });
}

describe('FollowingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    followsApi.getStatuses.mockResolvedValue({ statuses: {} });
  });

  afterEach(() => {
    cleanup();
  });

  test('renders three sections with independent empty states', async () => {
    mockFollowingByType({});

    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/not following any players yet/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/not following any leagues yet/i)).toBeInTheDocument();
    expect(screen.getByText(/not following any teams yet/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Players' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Leagues' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Teams' })).toBeInTheDocument();
  });

  test('renders a player card with a profile link when public', async () => {
    mockFollowingByType({
      user: [
        {
          userId: 'target-1',
          name: 'Jamie Rivera',
          avatarUrl: null,
          hasPublicProfile: true,
          profileHref: '/players/target-1',
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Jamie Rivera')).toBeInTheDocument());
    expect(screen.getByText(/view profile/i).closest('a')).toHaveAttribute(
      'href',
      '/players/target-1'
    );
  });

  test('renders a league card linking to the public league page', async () => {
    mockFollowingByType({
      league: [
        {
          leagueId: 'league-1',
          name: 'Open League',
          logo: null,
          slug: 'open',
          profileHref: '/league/open',
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Open League')).toBeInTheDocument());
    expect(screen.getByText(/view league/i).closest('a')).toHaveAttribute('href', '/league/open');
  });

  test('renders a team card linking to the public team page', async () => {
    mockFollowingByType({
      leagueTeam: [
        {
          leagueTeamId: 'team-1',
          name: 'Hawks',
          logo: null,
          teamSlug: 'hawks',
          leagueSlug: 'open',
          profileHref: '/league/open/teams/hawks',
        },
      ],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Hawks')).toBeInTheDocument());
    expect(screen.getByText(/view team/i).closest('a')).toHaveAttribute(
      'href',
      '/league/open/teams/hawks'
    );
  });

  test('a now-private league card shows no link (D8 degradation)', async () => {
    mockFollowingByType({
      league: [{ leagueId: 'league-2', name: 'Secret League', logo: null, profileHref: null }],
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Secret League')).toBeInTheDocument());
    expect(screen.getByText(/not currently public/i)).toBeInTheDocument();
    expect(screen.queryByText(/view league/i)).not.toBeInTheDocument();
  });

  test('surfaces a per-section load error', async () => {
    followsApi.listFollowing.mockImplementation((targetType) => {
      if (targetType === 'league') return Promise.reject(new Error('Boom'));
      return Promise.resolve({ following: [], nextCursor: null });
    });

    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Boom'));
  });

  test('never fetches follow status — every entry is already known to be followed', async () => {
    mockFollowingByType({
      user: [
        {
          userId: 'target-1',
          name: 'Jamie Rivera',
          avatarUrl: null,
          hasPublicProfile: true,
          profileHref: '/players/target-1',
        },
      ],
      league: [
        { leagueId: 'league-1', name: 'Open League', logo: null, profileHref: '/league/open' },
      ],
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Unfollow' }).length).toBeGreaterThanOrEqual(2)
    );
    expect(followsApi.getStatuses).not.toHaveBeenCalled();
  });
});
