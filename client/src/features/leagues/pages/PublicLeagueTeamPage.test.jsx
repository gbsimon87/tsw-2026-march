import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PublicLeagueTeamPage } from './PublicLeagueTeamPage';
import { leaguesApi } from '../api/leaguesApi';

const authState = { user: null };

vi.mock('../../../app/store/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../api/leaguesApi', () => ({
  leaguesApi: {
    getPublicTeam: vi.fn(),
    createJoinRequest: vi.fn(),
  },
}));

const response = {
  league: {
    id: 'league-1',
    name: 'Metro League',
    slug: 'metro-league',
    isPublic: false,
  },
  team: {
    id: 'team-a',
    name: 'Falcons',
    slug: 'falcons',
    standingsPosition: 2,
    roster: [],
    stats: [],
    games: [
      {
        id: 'game-1',
        status: 'completed',
        completedAt: '2026-03-01T18:00:00.000Z',
        homeLeagueTeamId: 'team-a',
        awayLeagueTeamId: 'team-b',
        homeTeamName: 'Falcons',
        awayTeamName: 'Bears',
        homePoints: 70,
        awayPoints: 60,
      },
      {
        id: 'game-2',
        status: 'completed',
        completedAt: '2026-03-08T18:00:00.000Z',
        homeLeagueTeamId: 'team-c',
        awayLeagueTeamId: 'team-a',
        homeTeamName: 'Owls',
        awayTeamName: 'Falcons',
        homePoints: 80,
        awayPoints: 70,
      },
    ],
  },
};

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/league/metro-league/teams/falcons']}>
      <Routes>
        <Route path="/league/:leagueSlug/teams/:teamSlug" element={<PublicLeagueTeamPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PublicLeagueTeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = null;
    sessionStorage.clear();
    leaguesApi.getPublicTeam.mockResolvedValue(response);
  });

  test('shows the team recent form with the latest result on the right', async () => {
    renderPage();

    const win = await screen.findByLabelText('Win against Bears, 70-60');
    const loss = screen.getByLabelText('Loss against Owls, 70-80');

    expect(win).toHaveTextContent('W');
    expect(loss).toHaveTextContent('L');
    expect(win.compareDocumentPosition(loss)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(leaguesApi.getPublicTeam).toHaveBeenCalledWith('metro-league', 'falcons');
  });

  test('requires users to confirm a player profile is theirs before requesting it', async () => {
    leaguesApi.getPublicTeam.mockResolvedValue({
      ...response,
      team: {
        ...response.team,
        roster: [
          {
            id: 'player-1',
            displayName: 'Jamie Rivera',
            isClaimed: false,
            isActive: true,
          },
        ],
      },
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Join' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Player — claim my profile' }));

    const submitButton = screen.getByRole('button', { name: 'Submit Request' });
    expect(screen.getByText(/team managers review every request/i)).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'player-1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'I confirm this is my player profile' }));

    expect(submitButton).toBeEnabled();
  });

  test('does not offer a player claim when no unclaimed roster profiles exist', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Join' }));

    expect(screen.getByRole('checkbox', { name: 'Player — claim my profile' })).toBeDisabled();
    expect(
      screen.getByText(/no unclaimed player profiles are currently available/i)
    ).toBeInTheDocument();
  });

  test('stashes an anonymous join attempt and sends the visitor to log in', async () => {
    leaguesApi.getPublicTeam.mockResolvedValue({
      ...response,
      team: {
        ...response.team,
        roster: [{ id: 'player-1', displayName: 'Jamie Rivera', isClaimed: false, isActive: true }],
      },
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Join' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Player — claim my profile' }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'player-1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'I confirm this is my player profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }));

    expect(JSON.parse(sessionStorage.getItem('join_pending_metro-league_falcons'))).toEqual({
      rolePlayer: true,
      roleTeamManager: false,
      requestedLeaguePlayerId: 'player-1',
    });
    expect(leaguesApi.createJoinRequest).not.toHaveBeenCalled();
  });

  // Regression: the pending payload used to be written and never read, so the
  // visitor came back from login to an empty form.
  test('restores a stashed join attempt after the visitor signs in', async () => {
    authState.user = { id: 'user-1', name: 'Jamie' };
    sessionStorage.setItem(
      'join_pending_metro-league_falcons',
      JSON.stringify({
        rolePlayer: true,
        roleTeamManager: true,
        requestedLeaguePlayerId: 'player-1',
      })
    );
    leaguesApi.getPublicTeam.mockResolvedValue({
      ...response,
      team: {
        ...response.team,
        roster: [{ id: 'player-1', displayName: 'Jamie Rivera', isClaimed: false, isActive: true }],
      },
    });

    renderPage();

    // Lands straight on the Join tab with the selection restored.
    expect(
      await screen.findByRole('checkbox', { name: 'Player — claim my profile' })
    ).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Team Manager' })).toBeChecked();
    expect(screen.getByRole('combobox')).toHaveValue('player-1');

    // The ownership confirmation is not restored, so the claim stays an
    // explicit post-login act and Submit remains closed until re-ticked.
    expect(
      screen.getByRole('checkbox', { name: 'I confirm this is my player profile' })
    ).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Submit Request' })).toBeDisabled();

    // The key is consumed, not left to leak.
    expect(sessionStorage.getItem('join_pending_metro-league_falcons')).toBeNull();
  });
});
