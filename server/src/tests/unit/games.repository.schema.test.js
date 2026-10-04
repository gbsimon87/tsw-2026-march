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

// Mux game video (docs/superpowers/plans/2026-10-04-mux-game-video.md, Task 2;
// rulings P6/E1/E2). Real Mongoose validation via validateSync — no database.
describe('Game.video schema (Mux game video)', () => {
  const GAME_ID = '64b7f0c2a1b2c3d4e5f60718';
  const OWNER_ID = '64b7f0c2a1b2c3d4e5f60719';
  const UPLOADER_ID = '64b7f0c2a1b2c3d4e5f6071a';

  function buildGame(overrides = {}) {
    return new Game({
      _id: GAME_ID,
      ownerUserId: OWNER_ID,
      title: 'Video schema game',
      ...overrides,
    });
  }

  function without(object, key) {
    const copy = { ...object };
    delete copy[key];
    return copy;
  }

  const readyVideo = {
    provider: 'mux',
    status: 'ready',
    generationId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    version: 1_759_600_000_000,
    uploadId: 'up-1',
    assetId: 'as-1',
    playbackId: 'pb-1',
    durationSeconds: 5400,
    uploadedByUserId: UPLOADER_ID,
    equivalentTimelines: ['youtube:dQw4w9WgXcQ'],
  };

  test('declares the hosted video sub-document', () => {
    expect(Game.schema.path('video.provider').enumValues).toEqual(['mux']);
    expect(Game.schema.path('video.status').enumValues).toEqual([
      'uploading',
      'processing',
      'ready',
      'errored',
    ]);
    for (const field of ['uploadId', 'assetId', 'playbackId', 'errorMessage', 'generationId']) {
      expect(Game.schema.path(`video.${field}`).instance).toBe('String');
    }
    expect(Game.schema.path('video.durationSeconds').instance).toBe('Number');
    expect(Game.schema.path('video.version').instance).toBe('Number');
    expect(Game.schema.path('video.equivalentTimelines').instance).toBe('Array');
  });

  test('defaults to null and validates without a video', () => {
    const game = buildGame();
    expect(game.video).toBeNull();
    expect(game.validateSync()).toBeUndefined();
  });

  test('a complete ready video validates and keeps every field', () => {
    const game = buildGame({ video: readyVideo });
    expect(game.validateSync()).toBeUndefined();
    expect(game.video.generationId).toBe(readyVideo.generationId);
    expect(game.video.version).toBe(readyVideo.version);
    expect([...game.video.equivalentTimelines]).toEqual(['youtube:dQw4w9WgXcQ']);
  });

  test('equivalentTimelines defaults to an empty list', () => {
    const game = buildGame({ video: without(readyVideo, 'equivalentTimelines') });
    expect([...game.video.equivalentTimelines]).toEqual([]);
  });

  test('rejects an unknown provider/status and a video missing its generation or version', () => {
    expect(buildGame({ video: { ...readyVideo, provider: 'vimeo' } }).validateSync()).toBeDefined();
    expect(buildGame({ video: { ...readyVideo, status: 'deleted' } }).validateSync()).toBeDefined();
    expect(
      buildGame({ video: without(readyVideo, 'generationId') }).validateSync().errors[
        'video.generationId'
      ]
    ).toBeDefined();
    expect(
      buildGame({ video: without(readyVideo, 'version') }).validateSync().errors['video.version']
    ).toBeDefined();
    expect(
      buildGame({ video: { ...readyVideo, version: 1.5 } }).validateSync().errors['video.version']
    ).toBeDefined();
    expect(
      buildGame({ video: { ...readyVideo, durationSeconds: -1 } }).validateSync().errors[
        'video.durationSeconds'
      ]
    ).toBeDefined();
  });

  // E1: video.* is written only by conditional updates that do not bump __v,
  // so a stat save from a doc loaded before a webhook landed must not carry
  // the stale `video` back to the database.
  test('a stat save on a loaded game never writes video (E1)', () => {
    for (const stored of [{}, { video: null }, { video: readyVideo }]) {
      const game = Game.hydrate({
        _id: GAME_ID,
        ownerUserId: OWNER_ID,
        title: 'Loaded',
        events: [],
        __v: 4,
        ...stored,
      });
      game.events.push({
        statType: 'FG2_MADE',
        segmentKind: 'regulation',
        segmentNumber: 1,
        clockMillisecondsRemaining: 600000,
        videoTimestamp: 12,
        videoTimelineId: 'youtube:dQw4w9WgXcQ',
      });
      game.eventCount = 1;
      expect(game.isModified('video')).toBe(false);
      const [, update] = game.$__delta();
      const writtenPaths = Object.values(update).flatMap((operator) => Object.keys(operator));
      expect(writtenPaths).toContain('events');
      expect(writtenPaths.filter((p) => p === 'video' || p.startsWith('video.'))).toEqual([]);
    }
  });
});

describe('Game events video timeline binding (P6)', () => {
  test('events declare an optional videoTimelineId', () => {
    const eventSchema = Game.schema.path('events').schema;
    expect(eventSchema.path('videoTimelineId').instance).toBe('String');
    expect(eventSchema.path('videoTimelineId').isRequired).toBeFalsy();
  });
});
