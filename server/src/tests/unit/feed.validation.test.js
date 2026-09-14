const { createPlayerGameCardPostSchema } = require('../../modules/feed/feed.validation');

const GAME_ID = '507f1f77bcf86cd799439015';
const TEAM_ID = '507f1f77bcf86cd799439016';
const PLAYER_ID = '507f1f77bcf86cd799439017';
const LEAGUE_TEAM_ID = '507f1f77bcf86cd799439014';
const LEAGUE_PLAYER_ID = '507f1f77bcf86cd799439013';

describe('createPlayerGameCardPostSchema', () => {
  test('accepts a standalone team + player pair', () => {
    const parsed = createPlayerGameCardPostSchema.parse({
      gameId: GAME_ID,
      teamId: TEAM_ID,
      playerId: PLAYER_ID,
      caption: 'Big night',
    });

    expect(parsed).toMatchObject({ gameId: GAME_ID, teamId: TEAM_ID, playerId: PLAYER_ID });
  });

  test('accepts a league team + league player pair', () => {
    const parsed = createPlayerGameCardPostSchema.parse({
      gameId: GAME_ID,
      leagueTeamId: LEAGUE_TEAM_ID,
      leaguePlayerId: LEAGUE_PLAYER_ID,
    });

    expect(parsed).toMatchObject({
      leagueTeamId: LEAGUE_TEAM_ID,
      leaguePlayerId: LEAGUE_PLAYER_ID,
    });
  });

  test('rejects a request with no game', () => {
    expect(() =>
      createPlayerGameCardPostSchema.parse({ teamId: TEAM_ID, playerId: PLAYER_ID })
    ).toThrow();
  });

  test('rejects a malformed game id', () => {
    expect(() =>
      createPlayerGameCardPostSchema.parse({
        gameId: 'not-an-object-id',
        teamId: TEAM_ID,
        playerId: PLAYER_ID,
      })
    ).toThrow();
  });

  // TSW-005: a card is either standalone or league-sourced, never both and
  // never half of each.
  test('rejects both id pairs at once', () => {
    expect(() =>
      createPlayerGameCardPostSchema.parse({
        gameId: GAME_ID,
        teamId: TEAM_ID,
        playerId: PLAYER_ID,
        leagueTeamId: LEAGUE_TEAM_ID,
        leaguePlayerId: LEAGUE_PLAYER_ID,
      })
    ).toThrow();
  });

  test('rejects a player without its team', () => {
    expect(() =>
      createPlayerGameCardPostSchema.parse({ gameId: GAME_ID, playerId: PLAYER_ID })
    ).toThrow();
  });

  test('rejects a caption over 280 characters', () => {
    expect(() =>
      createPlayerGameCardPostSchema.parse({
        gameId: GAME_ID,
        teamId: TEAM_ID,
        playerId: PLAYER_ID,
        caption: 'x'.repeat(281),
      })
    ).toThrow();
  });
});
