// docs/posthog.md §11.4 / §16.3: the league-side activation events must be
// server-confirmed, carry only approved context, and — for the one-time
// transitions — survive a repeated request without emitting twice.
jest.mock('../../modules/analytics/analytics.service', () => ({
  captureUserEventDetached: jest.fn(),
}));

jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeagueById: jest.fn(),
  findLeagueByIdAndOwner: jest.fn(),
  findLeagueBySlug: jest.fn(),
  listLeaguesByIds: jest.fn(),
  listLeaguesByOwner: jest.fn(),
  listLeaguesByManager: jest.fn(() => Promise.resolve([])),
  createLeague: jest.fn(),
  saveLeague: jest.fn(),
  createLeagueTeam: jest.fn(),
  listLeagueTeams: jest.fn(() => Promise.resolve([])),
  findLeagueTeamById: jest.fn(),
  findLeagueTeamByIdAndLeague: jest.fn(),
  findLeagueTeamByLeagueAndSlug: jest.fn(),
  listLeagueTeamsByIds: jest.fn(() => Promise.resolve([])),
  saveLeagueTeam: jest.fn(),
  createLeaguePlayer: jest.fn(),
  findLeaguePlayerById: jest.fn(),
  findLeaguePlayerByIdAndTeam: jest.fn(),
  listLeaguePlayers: jest.fn(() => Promise.resolve([])),
  listLeaguePlayersByClaimedUser: jest.fn(() => Promise.resolve([])),
  saveLeaguePlayer: jest.fn(),
  createLeagueTeamMember: jest.fn(),
  findActiveLeagueTeamMember: jest.fn(() => Promise.resolve(null)),
  findLeagueTeamMemberById: jest.fn(),
  listLeagueTeamMembers: jest.fn(() => Promise.resolve([])),
  listLeagueMembershipsForUser: jest.fn(() => Promise.resolve([])),
  saveLeagueTeamMember: jest.fn(),
  createLeagueJoinRequest: jest.fn(),
  findLeagueJoinRequestById: jest.fn(),
  findPendingLeagueJoinRequest: jest.fn(),
  listLeagueJoinRequests: jest.fn(() => Promise.resolve([])),
  saveLeagueJoinRequest: jest.fn(),
  findLeagueStandings: jest.fn(),
  upsertLeagueStandings: jest.fn(),
  listLeaguePlayerStats: jest.fn(() => Promise.resolve([])),
  listLeaguePlayerStatsByPlayerIds: jest.fn(() => Promise.resolve([])),
  replaceLeaguePlayerStats: jest.fn(),
  findActiveLeagueManager: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('../../modules/games/games.repository', () => ({
  listLeagueGamesByLeagueId: jest.fn(() => Promise.resolve([])),
}));

jest.mock('../../modules/leagues/seasons.repository', () => ({
  createSeason: jest.fn(),
  findSeasonById: jest.fn(),
  findSeasonByIdAndLeague: jest.fn(),
  listSeasonsByLeague: jest.fn(() => Promise.resolve([])),
  saveSeason: jest.fn(),
}));

jest.mock('../../modules/auth/auth.repository', () => ({
  findUserByEmail: jest.fn(),
  findUserById: jest.fn(),
}));

jest.mock('../../modules/feed/cloudinary.client', () => ({
  uploadImageBuffer: jest.fn(),
  destroyImage: jest.fn(),
  isCloudinaryConfigured: jest.fn(() => true),
}));

jest.mock('../../modules/feed/feed.service', () => ({
  reverseAutoPostsForLeague: jest.fn(() => Promise.resolve({ deletedCount: 0 })),
}));

const { captureUserEventDetached } = require('../../modules/analytics/analytics.service');
const {
  findLeagueById,
  createLeagueTeam,
  listLeagueTeams,
  findLeagueTeamByIdAndLeague,
  listLeaguePlayers,
  createLeaguePlayer,
  findActiveLeagueManager,
  findActiveLeagueTeamMember,
} = require('../../modules/leagues/leagues.repository');
const {
  createLeagueTeamForLeague,
  addPlayerToLeagueTeam,
} = require('../../modules/leagues/leagues.service');

const CONSENT = { accepted: true, version: 2 };
const LEAGUE = {
  _id: 'league-1',
  ownerUserId: 'owner-1',
  name: 'South London League',
  slug: 'south-london-league',
  status: 'active',
  plan: 'league_plus',
  billingSource: 'comp',
  subscriptionStatus: 'inactive',
  currentSeasonId: 'season-1',
};

function eventsNamed(name) {
  return captureUserEventDetached.mock.calls.map(([call]) => call).filter((c) => c.event === name);
}

beforeEach(() => {
  jest.clearAllMocks();
  findLeagueById.mockResolvedValue(LEAGUE);
  listLeagueTeams.mockResolvedValue([]);
  listLeaguePlayers.mockResolvedValue([]);
  findActiveLeagueManager.mockResolvedValue(null);
  findActiveLeagueTeamMember.mockResolvedValue(null);
  createLeagueTeam.mockImplementation((doc) =>
    Promise.resolve({ ...doc, _id: 'league-team-1', createdAt: new Date(), updatedAt: new Date() })
  );
  createLeaguePlayer.mockImplementation((doc) =>
    Promise.resolve({
      ...doc,
      _id: 'league-player-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );
  findLeagueTeamByIdAndLeague.mockResolvedValue({
    _id: 'league-team-1',
    leagueId: 'league-1',
    name: 'Brixton Ballers',
    slug: 'brixton-ballers',
    status: 'active',
  });
});

describe('league_team_created', () => {
  test('is captured after the team is committed, with IDs and never a name', async () => {
    await createLeagueTeamForLeague(
      'owner-1',
      'league-1',
      { name: 'Brixton Ballers' },
      {
        analyticsConsent: CONSENT,
      }
    );

    expect(eventsNamed('league_team_created')).toEqual([
      {
        userId: 'owner-1',
        event: 'league_team_created',
        properties: {
          league_id: 'league-1',
          league_team_id: 'league-team-1',
          actor_role: 'league_owner',
        },
        consent: CONSENT,
      },
    ]);
  });

  test('uses the league_manager role for a non-owner manager', async () => {
    findActiveLeagueManager.mockResolvedValue({ _id: 'mgr-1', userId: 'manager-1' });

    await createLeagueTeamForLeague(
      'manager-1',
      'league-1',
      { name: 'Peckham Pride' },
      {
        analyticsConsent: CONSENT,
      }
    );

    expect(eventsNamed('league_team_created')[0].properties.actor_role).toBe('league_manager');
  });

  test('is not captured when the name collides and nothing is committed', async () => {
    listLeagueTeams.mockResolvedValue([
      { _id: 'league-team-1', name: 'Brixton Ballers', slug: 'brixton-ballers', status: 'active' },
    ]);

    await expect(
      createLeagueTeamForLeague(
        'owner-1',
        'league-1',
        { name: 'Brixton Ballers' },
        {
          analyticsConsent: CONSENT,
        }
      )
    ).rejects.toThrow('League team name is already in use');

    expect(eventsNamed('league_team_created')).toHaveLength(0);
  });
});

describe('roster_populated for a league team', () => {
  test('fires once for the first player', async () => {
    await addPlayerToLeagueTeam(
      'owner-1',
      'league-1',
      'league-team-1',
      { displayName: 'Alex' },
      {
        analyticsConsent: CONSENT,
      }
    );

    expect(eventsNamed('roster_populated')).toEqual([
      {
        userId: 'owner-1',
        event: 'roster_populated',
        properties: {
          resource_type: 'league_team',
          resource_id: 'league-team-1',
          league_id: 'league-1',
          actor_role: 'league_owner',
          method: 'manual',
        },
        consent: CONSENT,
      },
    ]);
  });

  test('does not fire again for the second player', async () => {
    listLeaguePlayers.mockResolvedValue([
      { _id: 'league-player-1', displayName: 'Alex', isActive: true },
    ]);

    await addPlayerToLeagueTeam(
      'owner-1',
      'league-1',
      'league-team-1',
      { displayName: 'Sam' },
      {
        analyticsConsent: CONSENT,
      }
    );

    expect(eventsNamed('roster_populated')).toHaveLength(0);
  });

  // Players are deactivated rather than deleted, so a roster that was once
  // populated can never look empty again and re-fire the transition.
  test('does not fire again once every player has been deactivated', async () => {
    listLeaguePlayers.mockResolvedValue([
      { _id: 'league-player-1', displayName: 'Alex', isActive: false },
    ]);

    await addPlayerToLeagueTeam(
      'owner-1',
      'league-1',
      'league-team-1',
      { displayName: 'Sam' },
      {
        analyticsConsent: CONSENT,
      }
    );

    expect(eventsNamed('roster_populated')).toHaveLength(0);
  });

  test('is not captured when the duplicate-name request is rejected', async () => {
    listLeaguePlayers.mockResolvedValue([]);
    createLeaguePlayer.mockRejectedValue(new Error('write failed'));

    await expect(
      addPlayerToLeagueTeam(
        'owner-1',
        'league-1',
        'league-team-1',
        { displayName: 'Alex' },
        {
          analyticsConsent: CONSENT,
        }
      )
    ).rejects.toThrow('write failed');

    expect(eventsNamed('roster_populated')).toHaveLength(0);
  });
});
