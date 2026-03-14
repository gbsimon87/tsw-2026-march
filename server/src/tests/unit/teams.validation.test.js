const { createTeamSchema, updateTeamSchema } = require('../../modules/teams/teams.validation');

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
});
