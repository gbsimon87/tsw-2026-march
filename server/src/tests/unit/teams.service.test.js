jest.mock('../../modules/teams/teams.repository', () => ({
  createTeam: jest.fn(),
  listTeamsByOwner: jest.fn(),
  findTeamByIdAndOwner: jest.fn(),
  findTeamById: jest.fn(),
  listTeams: jest.fn(),
  saveTeam: jest.fn(async (team) => team),
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
});
