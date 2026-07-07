// OPT-022: regression guard for the participant.slug bug. Schema-introspection
// only (no DB connection) — `slug` was written at game-creation time but
// silently dropped on save because the embedded participant schema never
// declared the field. This test fails immediately if that field is ever
// removed again.
const mongoose = require('mongoose');

// This file must NOT run alongside a test that does `jest.mock('mongoose')` —
// it needs the real schema. games.repository.js registers the model on
// require; guard against "model already registered" if it's ever imported by
// another suite in the same worker.
require('../../modules/games/games.repository');

const Game = mongoose.model('Game');

describe('Game.homeParticipant/awayParticipant schema (OPT-022)', () => {
  test('participant sub-schema declares a slug field', () => {
    const homeSlugPath = Game.schema.path('homeParticipant.slug');
    const awaySlugPath = Game.schema.path('awayParticipant.slug');

    expect(homeSlugPath).toBeDefined();
    expect(awaySlugPath).toBeDefined();
    expect(homeSlugPath.instance).toBe('String');
    expect(awaySlugPath.instance).toBe('String');
  });

  test('a slug value assigned at construction is retained (not silently dropped)', () => {
    const game = new Game({
      ownerUserId: new mongoose.Types.ObjectId(),
      gameContext: 'league',
      trackingMode: 'dual_team',
      leagueId: new mongoose.Types.ObjectId(),
      homeLeagueTeamId: new mongoose.Types.ObjectId(),
      awayLeagueTeamId: new mongoose.Types.ObjectId(),
      title: 'Schema guard game',
      homeParticipant: {
        side: 'home',
        participantType: 'league_team',
        leagueTeamId: new mongoose.Types.ObjectId(),
        slug: 'home-team-slug',
        displayName: 'Home',
      },
      awayParticipant: {
        side: 'away',
        participantType: 'league_team',
        leagueTeamId: new mongoose.Types.ObjectId(),
        slug: 'away-team-slug',
        displayName: 'Away',
      },
    });

    // Before this fix, an undeclared schema field is stripped at construction
    // time — this assertion would have failed on the pre-fix schema.
    expect(game.homeParticipant.slug).toBe('home-team-slug');
    expect(game.awayParticipant.slug).toBe('away-team-slug');
  });
});
