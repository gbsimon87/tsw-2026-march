const {
  evaluateCatalog,
  hasRecordedStats,
  MILESTONE_FAMILIES,
  MILESTONE_TIERS,
} = require('../../modules/milestones/milestones.catalog');

// Mirrors the real career-totals shape from resolveCareerTotals, INCLUDING the
// attempt counters — hasRecordedStats() reads those, so a narrower fixture
// would let a debut-detection bug pass unnoticed.
function totals(overrides = {}) {
  return {
    gamesCount: 10,
    points: 0,
    reb: 0,
    ast: 0,
    fg3m: 0,
    fg3a: 0,
    fg2a: 0,
    fta: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    foul: 0,
    ...overrides,
  };
}

function line(overrides = {}) {
  return {
    points: 0,
    reb: 0,
    ast: 0,
    fg3m: 0,
    fg3a: 0,
    fg2a: 0,
    fta: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    foul: 0,
    ...overrides,
  };
}

function keysOf(results) {
  return results.map((r) => r.key).sort();
}

describe('career thresholds', () => {
  test('awards a threshold when the total crosses a rung', () => {
    const results = evaluateCatalog(
      totals({ points: 480 }),
      totals({ points: 505 }),
      line({ points: 25 })
    );
    expect(keysOf(results)).toContain('career_points_500');
  });

  test('treats landing exactly on a rung as a crossing', () => {
    const results = evaluateCatalog(
      totals({ points: 990 }),
      totals({ points: 1000 }),
      line({ points: 10 })
    );
    expect(keysOf(results)).toContain('career_points_1000');
  });

  test('does not re-award a rung already passed', () => {
    const results = evaluateCatalog(
      totals({ points: 1001 }),
      totals({ points: 1012 }),
      line({ points: 11 })
    );
    expect(keysOf(results)).not.toContain('career_points_1000');
  });

  test('records only the highest rung when one game crosses two', () => {
    const results = evaluateCatalog(
      totals({ points: 90 }),
      totals({ points: 260 }),
      line({ points: 170 })
    );
    const pointKeys = keysOf(results).filter((k) => k.startsWith('career_points_'));
    expect(pointKeys).toEqual(['career_points_250']);
  });

  test('tiers steals and blocks thresholds as profile-only', () => {
    const results = evaluateCatalog(totals({ stl: 45 }), totals({ stl: 52 }), line({ stl: 7 }));
    const steal = results.find((r) => r.key === 'career_stl_50');
    expect(steal.tier).toBe(MILESTONE_TIERS.PROFILE);
  });

  test('tiers the 1000-point threshold as feed', () => {
    const results = evaluateCatalog(
      totals({ points: 995 }),
      totals({ points: 1005 }),
      line({ points: 10 })
    );
    const milestone = results.find((r) => r.key === 'career_points_1000');
    expect(milestone.tier).toBe(MILESTONE_TIERS.FEED);
    expect(milestone.family).toBe(MILESTONE_FAMILIES.CAREER_THRESHOLD);
    expect(milestone.value).toBe(1000);
  });
});

describe('single-game feats', () => {
  test('awards a triple-double and suppresses the double-double', () => {
    const results = evaluateCatalog(
      totals(),
      totals({ points: 12, reb: 11, ast: 10 }),
      line({ points: 12, reb: 11, ast: 10 })
    );
    expect(keysOf(results)).toContain('triple_double');
    expect(keysOf(results)).not.toContain('double_double');
  });

  test('awards a double-double on exactly two categories', () => {
    const results = evaluateCatalog(
      totals(),
      totals({ points: 20, reb: 10 }),
      line({ points: 20, reb: 10 })
    );
    expect(keysOf(results)).toContain('double_double');
  });

  test('records only the highest points rung', () => {
    const results = evaluateCatalog(totals(), totals({ points: 41 }), line({ points: 41 }));
    const pts = keysOf(results).filter((k) => k.startsWith('pts_'));
    expect(pts).toEqual(['pts_40']);
  });

  test('records only the highest threes rung', () => {
    const results = evaluateCatalog(totals(), totals({ fg3m: 11 }), line({ fg3m: 11 }));
    const threes = keysOf(results).filter((k) => k.startsWith('fg3m_'));
    expect(threes).toEqual(['fg3m_10']);
  });

  test('awards 5+ blocks as feed tier', () => {
    const results = evaluateCatalog(totals(), totals({ blk: 5 }), line({ blk: 5 }));
    expect(results.find((r) => r.key === 'blk_5').tier).toBe(MILESTONE_TIERS.FEED);
  });
});

describe('firsts', () => {
  test('awards a debut on the first game with recorded stats', () => {
    const results = evaluateCatalog(
      totals({ gamesCount: 2 }),
      totals({ gamesCount: 3, points: 4 }),
      line({ points: 4, fg2a: 3 })
    );
    expect(keysOf(results)).toContain('first_career_game');
  });

  test('does not award a debut when earlier games already had stats', () => {
    const results = evaluateCatalog(
      totals({ points: 8, fg2a: 9, foul: 2 }),
      totals({ points: 14, fg2a: 14, foul: 3 }),
      line({ points: 6, fg2a: 5, foul: 1 })
    );
    expect(keysOf(results)).not.toContain('first_career_game');
  });

  test('does not award a debut to a veteran whose prior games were scoreless', () => {
    // Regression guard: `before` is a career-totals object, not a box-score
    // row. If the totals shape omits the attempt counters, hasRecordedStats
    // reads undefined for all of them and every game looks like a debut.
    const results = evaluateCatalog(
      totals({ points: 0, fg2a: 12, foul: 6 }),
      totals({ points: 2, fg2a: 15, foul: 7 }),
      line({ points: 2, fg2a: 3, foul: 1 })
    );
    expect(keysOf(results)).not.toContain('first_career_game');
  });

  test('does not award a debut for a scoreless bench appearance', () => {
    const results = evaluateCatalog(totals({ gamesCount: 0 }), totals({ gamesCount: 1 }), line());
    expect(keysOf(results)).not.toContain('first_career_game');
  });

  test('awards first career three', () => {
    const results = evaluateCatalog(
      totals({ points: 6 }),
      totals({ points: 9, fg3m: 1 }),
      line({ points: 3, fg3m: 1 })
    );
    expect(keysOf(results)).toContain('first_career_three');
  });
});

describe('hasRecordedStats', () => {
  test('is false for an all-zero line', () => {
    expect(hasRecordedStats(line())).toBe(false);
  });

  test('is true when only a foul was recorded', () => {
    expect(hasRecordedStats(line({ foul: 1 }))).toBe(true);
  });

  test('is true for a missed shot with no points', () => {
    expect(hasRecordedStats(line({ fg3a: 1 }))).toBe(true);
  });
});

describe('rarity ranking', () => {
  test('ranks a triple-double above a 40-point game', () => {
    const results = evaluateCatalog(
      totals(),
      totals({ points: 41, reb: 10, ast: 10 }),
      line({ points: 41, reb: 10, ast: 10 })
    );
    const triple = results.find((r) => r.key === 'triple_double');
    const forty = results.find((r) => r.key === 'pts_40');
    expect(triple.rarityRank).toBeLessThan(forty.rarityRank);
  });
});
