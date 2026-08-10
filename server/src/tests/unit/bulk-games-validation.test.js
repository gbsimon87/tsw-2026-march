const { bulkCreateLeagueGamesSchema } = require('../../modules/leagues/leagues.validation');

const validGame = {
  homeLeagueTeamId: '507f1f77bcf86cd799439011',
  awayLeagueTeamId: '507f1f77bcf86cd799439012',
  scheduledAt: '2026-09-05T10:00:00.000Z',
};

describe('bulkCreateLeagueGamesSchema', () => {
  it('accepts a valid payload and defaults replaceExisting to false', () => {
    const parsed = bulkCreateLeagueGamesSchema.parse({ games: [validGame] });

    expect(parsed.replaceExisting).toBe(false);
    expect(parsed.games).toHaveLength(1);
  });

  it('accepts an optional trimmed venue', () => {
    const parsed = bulkCreateLeagueGamesSchema.parse({
      games: [{ ...validGame, venue: '  Court 1  ' }],
    });

    expect(parsed.games[0].venue).toBe('Court 1');
  });

  it('accepts the maximum batch of 200 games', () => {
    const games = Array.from({ length: 200 }, () => validGame);

    expect(bulkCreateLeagueGamesSchema.parse({ games }).games).toHaveLength(200);
  });

  it('rejects an empty games array', () => {
    expect(() => bulkCreateLeagueGamesSchema.parse({ games: [] })).toThrow();
  });

  it('rejects more than 200 games', () => {
    const games = Array.from({ length: 201 }, () => validGame);

    expect(() => bulkCreateLeagueGamesSchema.parse({ games })).toThrow();
  });

  it('rejects a team playing itself', () => {
    expect(() =>
      bulkCreateLeagueGamesSchema.parse({
        games: [{ ...validGame, awayLeagueTeamId: validGame.homeLeagueTeamId }],
      })
    ).toThrow(/itself/i);
  });

  it('rejects a non-ISO scheduledAt', () => {
    expect(() =>
      bulkCreateLeagueGamesSchema.parse({
        games: [{ ...validGame, scheduledAt: 'next Saturday' }],
      })
    ).toThrow();
  });

  it('requires scheduledAt', () => {
    const withoutDate = {
      homeLeagueTeamId: validGame.homeLeagueTeamId,
      awayLeagueTeamId: validGame.awayLeagueTeamId,
    };

    expect(() => bulkCreateLeagueGamesSchema.parse({ games: [withoutDate] })).toThrow();
  });

  it('rejects a venue longer than 120 characters', () => {
    expect(() =>
      bulkCreateLeagueGamesSchema.parse({
        games: [{ ...validGame, venue: 'x'.repeat(121) }],
      })
    ).toThrow();
  });
});
