// docs/posthog.md §11.4 / §16.3: roster_populated is a one-time transition per
// resource, and the standalone-team side of it lives in the controller because
// only the returned roster tells it whether this was the first player.
jest.mock('../../modules/analytics/analytics.service', () => ({
  captureUserEventDetached: jest.fn(),
}));

jest.mock('../../modules/teams/teams.service', () => ({
  createTeamForUser: jest.fn(),
  addPlayerToTeam: jest.fn(),
}));

const { captureUserEventDetached } = require('../../modules/analytics/analytics.service');
const teamsService = require('../../modules/teams/teams.service');
const { ACCEPTED_HEADER } = require('../../modules/analytics/analyticsConsent');
const teamsController = require('../../modules/teams/teams.controller');

const CONSENT = { accepted: true, version: 2 };

function buildReq(body = {}, params = {}, headers = { 'x-analytics-consent': ACCEPTED_HEADER }) {
  return { auth: { userId: 'user-1' }, body, params, headers };
}

function buildRes() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}

function eventsNamed(name) {
  return captureUserEventDetached.mock.calls.map(([call]) => call).filter((c) => c.event === name);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('team creation analytics', () => {
  test('captures resource_created with an ID and never the team name', async () => {
    teamsService.createTeamForUser.mockResolvedValue({
      id: 'team-1',
      name: 'Brixton Ballers',
      players: [],
    });

    await teamsController.create(buildReq({ name: 'Brixton Ballers' }), buildRes());

    expect(eventsNamed('resource_created')).toEqual([
      {
        userId: 'user-1',
        event: 'resource_created',
        properties: {
          resource_type: 'team',
          resource_id: 'team-1',
          actor_role: 'team_manager',
        },
        consent: CONSENT,
      },
    ]);
    expect(eventsNamed('roster_populated')).toHaveLength(0);
  });

  test('also captures roster_populated when the team is created with players', async () => {
    teamsService.createTeamForUser.mockResolvedValue({
      id: 'team-1',
      name: 'Brixton Ballers',
      players: [{ id: 'p1', isActive: true }],
    });

    await teamsController.create(buildReq({ name: 'Brixton Ballers' }), buildRes());

    expect(eventsNamed('roster_populated')).toHaveLength(1);
  });

  test('sends nothing when the browser has not consented', async () => {
    teamsService.createTeamForUser.mockResolvedValue({ id: 'team-1', name: 'X', players: [] });

    await teamsController.create(buildReq({ name: 'X' }, {}, {}), buildRes());

    expect(eventsNamed('resource_created')[0].consent).toEqual({ accepted: false, version: 2 });
  });
});

describe('roster_populated for a standalone team', () => {
  test('fires for the first player only', async () => {
    teamsService.addPlayerToTeam.mockResolvedValue({
      id: 'team-1',
      players: [{ id: 'p1', isActive: true }],
    });

    await teamsController.addPlayer(
      buildReq({ displayName: 'Alex' }, { teamId: 'team-1' }),
      buildRes()
    );

    expect(eventsNamed('roster_populated')).toEqual([
      {
        userId: 'user-1',
        event: 'roster_populated',
        properties: {
          resource_type: 'team',
          resource_id: 'team-1',
          actor_role: 'team_manager',
          method: 'manual',
        },
        consent: CONSENT,
      },
    ]);
  });

  test('does not fire again for the second player', async () => {
    teamsService.addPlayerToTeam.mockResolvedValue({
      id: 'team-1',
      players: [
        { id: 'p1', isActive: true },
        { id: 'p2', isActive: true },
      ],
    });

    await teamsController.addPlayer(
      buildReq({ displayName: 'Sam' }, { teamId: 'team-1' }),
      buildRes()
    );

    expect(eventsNamed('roster_populated')).toHaveLength(0);
  });

  // Players are deactivated, not deleted, so the roster row survives and the
  // transition cannot repeat after a team empties out and refills.
  test('does not fire again after the only player is deactivated and replaced', async () => {
    teamsService.addPlayerToTeam.mockResolvedValue({
      id: 'team-1',
      players: [
        { id: 'p1', isActive: false },
        { id: 'p2', isActive: true },
      ],
    });

    await teamsController.addPlayer(
      buildReq({ displayName: 'Sam' }, { teamId: 'team-1' }),
      buildRes()
    );

    expect(eventsNamed('roster_populated')).toHaveLength(0);
  });

  test('is not captured when the add fails', async () => {
    teamsService.addPlayerToTeam.mockRejectedValue(new Error('write failed'));

    await expect(
      teamsController.addPlayer(buildReq({ displayName: 'Alex' }, { teamId: 'team-1' }), buildRes())
    ).rejects.toThrow('write failed');

    expect(eventsNamed('roster_populated')).toHaveLength(0);
  });
});
