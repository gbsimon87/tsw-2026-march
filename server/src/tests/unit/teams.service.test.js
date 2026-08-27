jest.mock('../../modules/teams/teams.repository', () => ({
  createTeam: jest.fn(),
  listTeamsByOwner: jest.fn(),
  findTeamByIdAndOwner: jest.fn(),
  findTeamById: jest.fn(),
  listTeams: jest.fn(),
  listTeamsByClaimedPlayerUserId: jest.fn(),
  saveTeam: jest.fn(async (team) => team),
  createPlayerClaimRequest: jest.fn(),
  findPendingPlayerClaimRequest: jest.fn(),
  listPendingPlayerClaimRequests: jest.fn(),
  findPlayerClaimRequestById: jest.fn(),
  savePlayerClaimRequest: jest.fn(async (request) => request),
}));

jest.mock('../../modules/auth/auth.repository', () => ({
  findUsersByIds: jest.fn(),
}));

jest.mock('../../modules/games/games.repository', () => ({
  listGamesByTeamId: jest.fn(),
  listCompletedGames: jest.fn(),
}));

jest.mock('../../modules/games/games.service', () => ({
  computeBoxScore: jest.fn(() => ({ players: [], teamTotals: {} })),
}));

jest.mock('../../modules/billing/billing.service', () => ({
  getBillingSummary: jest.fn(() => ({ plan: 'free' })),
  getTeamEntitlements: jest.fn(() => ({ canUseReplay: false })),
  assertTeamCreationAllowed: jest.fn(() => Promise.resolve({ capacityType: 'free' })),
  assertTeamManagementAllowed: jest.fn(),
}));

jest.mock('../../modules/feed/cloudinary.client', () => ({
  uploadImageBuffer: jest.fn(),
  destroyImage: jest.fn(() => Promise.resolve(null)),
  isCloudinaryConfigured: jest.fn(() => true),
}));

const repository = require('../../modules/teams/teams.repository');
const cloudinary = require('../../modules/feed/cloudinary.client');
const teamsService = require('../../modules/teams/teams.service');

function buildTeam(overrides = {}) {
  return {
    _id: 'team-1',
    ownerUserId: 'user-1',
    name: 'TSW Blue',
    logo: null,
    colors: [],
    homeVenue: null,
    players: [],
    plan: 'free',
    capacityType: 'free',
    createdAt: '2026-03-11T00:00:00.000Z',
    updatedAt: '2026-03-11T00:00:00.000Z',
    ...overrides,
  };
}

describe('teams service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates a team with colors, venue, and player positions', async () => {
    repository.createTeam.mockResolvedValue(
      buildTeam({
        colors: ['#112233'],
        homeVenue: {
          arenaName: 'Main Gym',
          addressLine1: '123 Court St',
          addressLine2: '',
          city: 'Toronto',
          state: 'ON',
          postalCode: 'M5V 1A1',
          country: 'Canada',
        },
        players: [
          { _id: 'p1', displayName: 'Jordan', jerseyNumber: 23, position: 'PG', isActive: true },
        ],
      })
    );

    const result = await teamsService.createTeamForUser('user-1', {
      name: 'TSW Blue',
      colors: ['#112233'],
      homeVenue: {
        arenaName: 'Main Gym',
        addressLine1: '123 Court St',
        city: 'Toronto',
        state: 'ON',
        postalCode: 'M5V 1A1',
        country: 'Canada',
      },
      players: [{ displayName: 'Jordan', jerseyNumber: 23, position: 'PG' }],
    });

    expect(repository.createTeam).toHaveBeenCalledWith(
      expect.objectContaining({
        colors: ['#112233'],
        homeVenue: expect.objectContaining({ arenaName: 'Main Gym' }),
      })
    );
    expect(result.players[0].position).toBe('PG');
    expect(result.homeVenue.arenaName).toBe('Main Gym');
  });

  test('uploads a team logo and replaces prior metadata', async () => {
    const team = buildTeam({
      logo: {
        url: 'https://old.example/logo.png',
        publicId: 'old-logo',
      },
    });
    repository.findTeamByIdAndOwner.mockResolvedValue(team);
    cloudinary.uploadImageBuffer.mockResolvedValue({
      secure_url: 'https://new.example/logo.png',
      public_id: 'new-logo',
      width: 128,
      height: 128,
    });

    const result = await teamsService.uploadLogoForTeam('user-1', 'team-1', {
      size: 1000,
      mimetype: 'image/png',
      buffer: Buffer.from('logo'),
    });

    expect(cloudinary.uploadImageBuffer).toHaveBeenCalled();
    expect(cloudinary.destroyImage).toHaveBeenCalledWith('old-logo');
    expect(result.logo.url).toBe('https://new.example/logo.png');
  });

  test('creates a pending standalone player claim for an unlinked profile', async () => {
    const teamId = '507f1f77bcf86cd799439011';
    const playerId = '507f1f77bcf86cd799439012';
    repository.findTeamById.mockResolvedValue(
      buildTeam({
        players: [{ _id: playerId, displayName: 'Jordan', isActive: true }],
      })
    );
    repository.findPendingPlayerClaimRequest.mockResolvedValue(null);
    repository.createPlayerClaimRequest.mockResolvedValue({
      _id: 'request-1',
      status: 'pending',
    });

    const result = await teamsService.requestStandalonePlayerClaim('requester-1', teamId, playerId);

    expect(repository.createPlayerClaimRequest).toHaveBeenCalledWith({
      teamId,
      playerId,
      requesterUserId: 'requester-1',
    });
    expect(result.status).toBe('pending');
  });

  test('links the player when the standalone team owner approves a claim', async () => {
    const player = { _id: 'player-1', displayName: 'Jordan', isActive: true };
    const team = buildTeam({ players: [player] });
    const request = {
      _id: 'request-1',
      teamId: 'team-1',
      playerId: 'player-1',
      requesterUserId: 'requester-1',
      status: 'pending',
    };
    repository.findTeamByIdAndOwner.mockResolvedValue(team);
    repository.findPlayerClaimRequestById.mockResolvedValue(request);

    const result = await teamsService.reviewStandalonePlayerClaim(
      'user-1',
      'team-1',
      'request-1',
      'approved'
    );

    expect(player.claimedByUserId).toBe('requester-1');
    expect(repository.saveTeam).toHaveBeenCalledWith(team);
    expect(request.status).toBe('approved');
    expect(result.status).toBe('approved');
  });
});
