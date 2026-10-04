// Mux game video P1/P4: the per-League operator grant. Real schema, no DB (E2).
const mongoose = require('mongoose');

require('../../modules/leagues/leagues.repository');

const League = mongoose.model('League');

const OWNER_ID = '64b7f0c2a1b2c3d4e5f60719';
const OPERATOR_ID = '64b7f0c2a1b2c3d4e5f6071a';

function buildLeague(overrides = {}) {
  return new League({
    ownerUserId: OWNER_ID,
    name: 'Video League',
    slug: 'video-league',
    ...overrides,
  });
}

describe('League.videoHosting (P1/P4)', () => {
  test('defaults closed: hosting off, 0 stored minutes, 1 concurrent upload, 3 creates/day', () => {
    const league = buildLeague();
    expect(league.validateSync()).toBeUndefined();
    expect(league.videoHosting.toObject()).toEqual({
      enabled: false,
      maxStoredMinutes: 0,
      maxConcurrentUploads: 1,
      maxCreatesPerDay: 3,
      publicClips: { status: 'unrecorded', updatedAt: null, updatedBy: null },
    });
  });

  test('a partial grant fills the remaining defaults', () => {
    const league = buildLeague({ videoHosting: { enabled: true, maxStoredMinutes: 600 } });
    expect(league.validateSync()).toBeUndefined();
    expect(league.videoHosting.maxConcurrentUploads).toBe(1);
    expect(league.videoHosting.publicClips.status).toBe('unrecorded');
  });

  test('a recorded footage grant validates', () => {
    const league = buildLeague({
      videoHosting: {
        enabled: true,
        publicClips: { status: 'granted', updatedAt: new Date(), updatedBy: OPERATOR_ID },
      },
    });
    expect(league.validateSync()).toBeUndefined();
  });

  test.each([
    ['maxStoredMinutes', -1],
    ['maxStoredMinutes', 1.5],
    ['maxConcurrentUploads', -1],
    ['maxConcurrentUploads', 2.5],
    ['maxCreatesPerDay', -3],
    ['maxCreatesPerDay', 0.5],
  ])('rejects %s = %s', (field, value) => {
    const error = buildLeague({ videoHosting: { [field]: value } }).validateSync();
    expect(error.errors[`videoHosting.${field}`]).toBeDefined();
  });

  test('rejects an unknown public-clips status', () => {
    const error = buildLeague({
      videoHosting: { publicClips: { status: 'maybe' } },
    }).validateSync();
    expect(error.errors['videoHosting.publicClips.status']).toBeDefined();
  });
});
