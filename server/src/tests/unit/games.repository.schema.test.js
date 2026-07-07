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

// OPT-007: regression guard for the 7 indexes proven dead from static
// analysis (no query anywhere filters on them) and dropped to stop paying
// their write cost on every save/event-append. Each assertion fails
// immediately if the redundant/unqueried `index: true` is ever re-added.
describe('Game schema — dead indexes removed (OPT-007)', () => {
  test('homeTeamId/awayTeamId/homeLeagueTeamId/awayLeagueTeamId have no standalone index (fully covered by their own {field, createdAt} compound)', () => {
    expect(Game.schema.path('homeTeamId')._index).toBeNull();
    expect(Game.schema.path('awayTeamId')._index).toBeNull();
    expect(Game.schema.path('homeLeagueTeamId')._index).toBeNull();
    expect(Game.schema.path('awayLeagueTeamId')._index).toBeNull();
  });

  test('the covering compound indexes for those 4 fields still exist', () => {
    const indexes = Game.schema.indexes().map(([fields]) => fields);
    expect(indexes).toEqual(
      expect.arrayContaining([
        { homeTeamId: 1, createdAt: -1 },
        { awayTeamId: 1, createdAt: -1 },
        { homeLeagueTeamId: 1, createdAt: -1 },
        { awayLeagueTeamId: 1, createdAt: -1 },
      ])
    );
  });

  test('events.teamSide has no index (unqueried multikey index removed)', () => {
    const teamSidePath = Game.schema.path('events').schema.path('teamSide');
    expect(teamSidePath._index).toBeNull();
  });

  test('homeParticipant/awayParticipant teamId + leagueTeamId have no index (unqueried)', () => {
    const homePath = Game.schema.path('homeParticipant').schema;
    const awayPath = Game.schema.path('awayParticipant').schema;
    expect(homePath.path('teamId')._index).toBeNull();
    expect(homePath.path('leagueTeamId')._index).toBeNull();
    expect(awayPath.path('teamId')._index).toBeNull();
    expect(awayPath.path('leagueTeamId')._index).toBeNull();
  });

  test('fields that are queried standalone (leagueId, trackedLeagueTeamId, status, gameContext, trackingMode) keep their index — not part of this drop', () => {
    // These are candidates for OPT-007's remaining, traffic-gated step, not
    // provable dead from code alone — must NOT be touched by this change.
    expect(Game.schema.path('leagueId')._index).toBe(true);
    expect(Game.schema.path('trackedLeagueTeamId')._index).toBe(true);
    expect(Game.schema.path('status')._index).toBe(true);
    expect(Game.schema.path('gameContext')._index).toBe(true);
    expect(Game.schema.path('trackingMode')._index).toBe(true);
  });
});
