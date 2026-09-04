// Round-trip net for the court layout contract. There is no in-memory Mongo in
// this repo's test infra, so this runs the REAL Mongoose schemas' full document
// validation (which needs no DB connection) and then the real recap serializer,
// which is where a coordinate could actually be lost or reinterpreted.
//
// What it protects: a click recorded on a game must come back at the exact same
// percentage, described by the exact same layout, on both a stamped game and a
// production-shaped legacy document that has no courtLayoutId at all.

const mongoose = require('mongoose');

require('../../modules/games/games.repository');
const { buildGameRecap } = require('../../modules/games/gameRecap.service');
const {
  CURRENT_COURT_LAYOUT_ID,
  LEGACY_COURT_LAYOUT_ID,
} = require('../../modules/shared/courtLayouts');

const Game = mongoose.models.Game;

// The exact shape inferCourtSelection produces for a tap on the v2 top of key.
const RECORDED_CLICK = { statType: 'FG2_MADE', zoneId: 'TOP_KEY', x: 49.91, y: 32.79 };

function buildGameDoc(overrides = {}) {
  return new Game({
    ownerUserId: new mongoose.Types.ObjectId(),
    teamId: new mongoose.Types.ObjectId(),
    title: 'Round trip',
    status: 'in_progress',
    events: [
      {
        playerId: new mongoose.Types.ObjectId(),
        ...RECORDED_CLICK,
        occurredAt: new Date('2026-09-04T12:00:00.000Z'),
        segmentKind: 'regulation',
        segmentNumber: 1,
        clockMillisecondsRemaining: 480000,
      },
    ],
    ...overrides,
  });
}

describe('court layout round trip', () => {
  test('a stamped game validates and returns its click unchanged, on its own layout', async () => {
    const game = buildGameDoc({ courtLayoutId: CURRENT_COURT_LAYOUT_ID });

    await game.validate();

    expect(game.courtLayoutId).toBe(CURRENT_COURT_LAYOUT_ID);

    const recap = buildGameRecap(game, []);
    const [marker] = recap.shotSnapshot.events;

    expect(recap.shotSnapshot.courtLayoutId).toBe(CURRENT_COURT_LAYOUT_ID);
    expect(marker.x).toBe(RECORDED_CLICK.x);
    expect(marker.y).toBe(RECORDED_CLICK.y);
    expect(marker.zoneId).toBe(RECORDED_CLICK.zoneId);
  });

  // Mirrors a real pre-cutover production document: the field is simply absent.
  test('a legacy document with no courtLayoutId validates and resolves to legacy', async () => {
    const game = buildGameDoc();

    await game.validate();

    expect(game.courtLayoutId).toBeUndefined();

    const recap = buildGameRecap(game, []);
    const [marker] = recap.shotSnapshot.events;

    expect(recap.shotSnapshot.courtLayoutId).toBe(LEGACY_COURT_LAYOUT_ID);
    expect(marker.x).toBe(RECORDED_CLICK.x);
    expect(marker.y).toBe(RECORDED_CLICK.y);
  });

  test('an out-of-enum layout is rejected by the real schema', async () => {
    const game = buildGameDoc({ courtLayoutId: 'court-v9' });

    await expect(game.validate()).rejects.toThrow(/courtLayoutId/);
  });

  test('completing a game does not move its layout', async () => {
    const game = buildGameDoc({ courtLayoutId: CURRENT_COURT_LAYOUT_ID });
    await game.validate();

    game.status = 'completed';
    game.completedAt = new Date('2026-09-04T13:00:00.000Z');
    await game.validate();

    expect(game.courtLayoutId).toBe(CURRENT_COURT_LAYOUT_ID);
    expect(buildGameRecap(game, []).shotSnapshot.courtLayoutId).toBe(CURRENT_COURT_LAYOUT_ID);
  });
});
