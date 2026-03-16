const {
  createTeamSchema,
  updateTeamSchema,
  addPlayerSchema,
} = require('../../modules/teams/teams.validation');

describe('teams validation', () => {
  test('accepts trimmed team name when creating a team', () => {
    const parsed = createTeamSchema.parse({
      name: '  Varsity  ',
    });

    expect(parsed.name).toBe('Varsity');
  });

  test('accepts team name updates', () => {
    const parsed = updateTeamSchema.parse({
      name: 'Updated Team Name',
    });

    expect(parsed.name).toBe('Updated Team Name');
  });

  test('rejects empty team updates', () => {
    expect(() => updateTeamSchema.parse({})).toThrow('At least one field is required');
  });

  test('accepts colors, venue, and player positions', () => {
    const parsed = createTeamSchema.parse({
      name: 'TSW Blue',
      colors: ['#112233', '#D4AF37'],
      homeVenue: {
        arenaName: 'Main Gym',
        addressLine1: '123 Court St',
        city: 'Toronto',
        state: 'ON',
        postalCode: 'M5V 1A1',
        country: 'Canada',
      },
      players: [{ displayName: 'Jordan', position: 'PG' }],
    });

    expect(parsed.colors).toEqual(['#112233', '#D4AF37']);
    expect(parsed.homeVenue.arenaName).toBe('Main Gym');
    expect(parsed.players[0].position).toBe('PG');
  });

  test('rejects invalid hex colors', () => {
    expect(() =>
      createTeamSchema.parse({
        name: 'TSW Blue',
        colors: ['blue'],
      })
    ).toThrow('Invalid hex color');
  });

  test('rejects invalid player position', () => {
    expect(() =>
      addPlayerSchema.parse({
        displayName: 'Jordan',
        position: 'Guard',
      })
    ).toThrow();
  });
});
