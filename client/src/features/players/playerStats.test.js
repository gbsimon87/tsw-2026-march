import { describe, expect, it } from 'vitest';
import {
  buildPlayerSeasonOptions,
  filterPlayerGamesBySeason,
  getCategoryStatIds,
  getGameSeasonKey,
  PLAYER_STAT_CATEGORIES,
  summarizePlayerGames,
} from './playerStats';

describe('getCategoryStatIds', () => {
  it('returns the scoring stats for the scoring category', () => {
    expect(getCategoryStatIds('scoring')).toEqual(['ft', 'fg2', 'fg3', 'points']);
  });

  it('falls back to every stat for an unknown category', () => {
    expect(getCategoryStatIds('nonsense')).toEqual(getCategoryStatIds('all'));
  });

  it('exposes a stat list for every advertised category', () => {
    PLAYER_STAT_CATEGORIES.forEach((category) => {
      expect(getCategoryStatIds(category.value).length).toBeGreaterThan(0);
    });
  });
});

describe('getGameSeasonKey', () => {
  it('prefers an explicit season id', () => {
    expect(getGameSeasonKey({ seasonId: 'abc', date: '2025-01-02' })).toBe('season:abc');
  });

  it('falls back to the calendar year of the game date', () => {
    expect(getGameSeasonKey({ date: '2025-03-04T10:00:00.000Z' })).toBe('year:2025');
  });

  it('reads a date from completedAt, scheduledAt, then createdAt', () => {
    expect(getGameSeasonKey({ completedAt: '2024-06-01T00:00:00.000Z' })).toBe('year:2024');
    expect(getGameSeasonKey({ scheduledAt: '2023-06-01T00:00:00.000Z' })).toBe('year:2023');
    expect(getGameSeasonKey({ createdAt: '2022-06-01T00:00:00.000Z' })).toBe('year:2022');
  });

  it('marks a game with no usable date as undated', () => {
    expect(getGameSeasonKey({})).toBe('undated');
    expect(getGameSeasonKey({ date: 'not-a-date' })).toBe('undated');
  });
});

describe('buildPlayerSeasonOptions', () => {
  it('labels seasons from the supplied season list', () => {
    const options = buildPlayerSeasonOptions(
      [{ seasonId: 's1' }, { seasonId: 's2' }],
      [
        { id: 's1', label: '2024/25' },
        { id: 's2', label: '2025/26' },
      ]
    );

    expect(options).toEqual([
      { value: 'season:s1', label: '2024/25' },
      { value: 'season:s2', label: '2025/26' },
    ]);
  });

  it('deduplicates repeated seasons and preserves first-seen order', () => {
    const options = buildPlayerSeasonOptions(
      [{ seasonId: 's2' }, { seasonId: 's1' }, { seasonId: 's2' }],
      [
        { id: 's1', label: '2024/25' },
        { id: 's2', label: '2025/26' },
      ]
    );

    expect(options.map((option) => option.value)).toEqual(['season:s2', 'season:s1']);
  });

  it('labels an unrecognised season id rather than dropping it', () => {
    expect(buildPlayerSeasonOptions([{ seasonId: 'ghost' }], [])).toEqual([
      { value: 'season:ghost', label: 'Unlabelled season' },
    ]);
  });

  it('derives a year label for games with no season id', () => {
    expect(buildPlayerSeasonOptions([{ date: '2025-02-02T00:00:00.000Z' }], [])).toEqual([
      { value: 'year:2025', label: '2025 season' },
    ]);
  });

  it('labels undated games explicitly', () => {
    expect(buildPlayerSeasonOptions([{}], [])).toEqual([
      { value: 'undated', label: 'Date unavailable' },
    ]);
  });

  it('returns nothing for an empty game list', () => {
    expect(buildPlayerSeasonOptions([], [])).toEqual([]);
    expect(buildPlayerSeasonOptions()).toEqual([]);
  });
});

describe('filterPlayerGamesBySeason', () => {
  const games = [
    { id: 'a', seasonId: 's1' },
    { id: 'b', seasonId: 's2' },
    { id: 'c', date: '2025-01-01T00:00:00.000Z' },
  ];

  it('returns every game for the "all" key', () => {
    expect(filterPlayerGamesBySeason(games, 'all')).toHaveLength(3);
  });

  it('keeps only games in the requested season', () => {
    expect(filterPlayerGamesBySeason(games, 'season:s1').map((game) => game.id)).toEqual(['a']);
  });

  it('filters by derived year key', () => {
    expect(filterPlayerGamesBySeason(games, 'year:2025').map((game) => game.id)).toEqual(['c']);
  });

  it('returns nothing for a season with no games', () => {
    expect(filterPlayerGamesBySeason(games, 'season:missing')).toEqual([]);
  });

  it('tolerates a missing game list', () => {
    expect(filterPlayerGamesBySeason(undefined, 'season:s1')).toEqual([]);
  });
});

describe('summarizePlayerGames', () => {
  const games = [
    { stats: { points: 10, reb: 4, ast: 2, stl: 1, blk: 0, tov: 3, foul: 2, fg2m: 4, fg2a: 8 } },
    { stats: { points: 20, reb: 6, ast: 4, stl: 3, blk: 2, tov: 1, foul: 0, fg2m: 8, fg2a: 12 } },
  ];

  it('totals counting stats across games', () => {
    const summary = summarizePlayerGames(games);

    expect(summary.points).toBe(30);
    expect(summary.reb).toBe(10);
    expect(summary.ast).toBe(6);
    expect(summary.fg2m).toBe(12);
    expect(summary.fg2a).toBe(20);
    expect(summary.gamesCount).toBe(2);
  });

  it('averages the per-game rates', () => {
    const summary = summarizePlayerGames(games);

    expect(summary.pointsPerGame).toBe(15);
    expect(summary.reboundsPerGame).toBe(5);
    expect(summary.assistsPerGame).toBe(3);
    expect(summary.stealsPerGame).toBe(2);
    expect(summary.blocksPerGame).toBe(1);
    expect(summary.turnoversPerGame).toBe(2);
    expect(summary.foulsPerGame).toBe(1);
  });

  it('treats missing stat fields as zero', () => {
    const summary = summarizePlayerGames([{ stats: { points: 5 } }, {}]);

    expect(summary.points).toBe(5);
    expect(summary.reb).toBe(0);
    expect(summary.gamesCount).toBe(2);
    expect(summary.pointsPerGame).toBe(2.5);
  });

  it('avoids dividing by zero with no games', () => {
    const summary = summarizePlayerGames([]);

    expect(summary.gamesCount).toBe(0);
    expect(summary.points).toBe(0);
    expect(summary.pointsPerGame).toBe(0);
    expect(summary.reboundsPerGame).toBe(0);
  });

  it('tolerates a missing game list', () => {
    expect(summarizePlayerGames().gamesCount).toBe(0);
  });
});
