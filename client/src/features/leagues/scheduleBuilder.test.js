import { describe, expect, it } from 'vitest';
import { assignDates, buildRoundRobin } from './scheduleBuilder';

const SUNDAY = 0;
const SATURDAY = 6;

function pairKeys(rounds) {
  return rounds.flatMap((round) =>
    round.games.map((game) => [game.homeLeagueTeamId, game.awayLeagueTeamId].sort().join('|'))
  );
}

describe('buildRoundRobin', () => {
  it('pairs every team exactly once for an even team count', () => {
    const rounds = buildRoundRobin(['a', 'b', 'c', 'd']);
    const pairs = pairKeys(rounds);

    expect(rounds).toHaveLength(3);
    expect(pairs).toHaveLength(6); // n(n-1)/2
    expect(new Set(pairs).size).toBe(6);
    expect(rounds.every((round) => round.byeTeamId === null)).toBe(true);
  });

  it('gives exactly one team a bye per round for an odd team count', () => {
    const rounds = buildRoundRobin(['a', 'b', 'c', 'd', 'e']);

    expect(rounds).toHaveLength(5);
    expect(pairKeys(rounds)).toHaveLength(10);
    expect(rounds.every((round) => round.games.length === 2)).toBe(true);
    expect(new Set(rounds.map((round) => round.byeTeamId)).size).toBe(5);
  });

  it('never schedules a team twice in the same round', () => {
    for (const teams of [
      ['a', 'b', 'c', 'd', 'e', 'f'],
      ['a', 'b', 'c'],
    ]) {
      for (const round of buildRoundRobin(teams)) {
        const appearances = round.games.flatMap((game) => [
          game.homeLeagueTeamId,
          game.awayLeagueTeamId,
        ]);
        expect(new Set(appearances).size).toBe(appearances.length);
      }
    }
  });

  // A fixed-position circle method makes it easy to strand the anchor (and the
  // team opposite it) on one side for a whole season, and the bug only shows at
  // some team counts — so assert the split for every realistic league size.
  it.each([2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 15, 16])(
    'keeps each of %i teams within one game of an even home/away split',
    (teamCount) => {
      const teams = Array.from({ length: teamCount }, (_, index) => `team-${index}`);
      const homeCounts = Object.fromEntries(teams.map((team) => [team, 0]));
      const awayCounts = Object.fromEntries(teams.map((team) => [team, 0]));

      for (const round of buildRoundRobin(teams)) {
        for (const game of round.games) {
          homeCounts[game.homeLeagueTeamId] += 1;
          awayCounts[game.awayLeagueTeamId] += 1;
        }
      }

      for (const team of teams) {
        expect(Math.abs(homeCounts[team] - awayCounts[team])).toBeLessThanOrEqual(1);
      }
    }
  );

  it.each([3, 4, 5, 8, 15, 16])('pairs all %i teams exactly once', (teamCount) => {
    const teams = Array.from({ length: teamCount }, (_, index) => `team-${index}`);
    const pairs = pairKeys(buildRoundRobin(teams));

    expect(pairs).toHaveLength((teamCount * (teamCount - 1)) / 2);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('numbers rounds from one', () => {
    expect(buildRoundRobin(['a', 'b', 'c', 'd']).map((round) => round.round)).toEqual([1, 2, 3]);
  });

  it('returns no rounds for fewer than two teams', () => {
    expect(buildRoundRobin([])).toEqual([]);
    expect(buildRoundRobin(['a'])).toEqual([]);
    expect(buildRoundRobin(null)).toEqual([]);
  });
});

describe('assignDates', () => {
  const rounds = buildRoundRobin(['a', 'b', 'c', 'd']); // 3 rounds x 2 games

  const baseOptions = {
    startDate: '2026-09-05', // a Saturday
    weekdays: [SATURDAY],
    slots: ['10:00', '11:30'],
  };

  it('fills a game-day slot by slot, then opens the next round on a new game-day', () => {
    const { rows, overflowCount } = assignDates(rounds, baseOptions);
    const games = rows.filter((row) => !row.isBye);

    expect(games).toHaveLength(6);
    expect(overflowCount).toBe(0);

    expect(games[0].scheduledAt.getFullYear()).toBe(2026);
    expect(games[0].scheduledAt.getMonth()).toBe(8);
    expect(games[0].scheduledAt.getDate()).toBe(5);
    expect(games[0].scheduledAt.getHours()).toBe(10);
    expect(games[0].scheduledAt.getMinutes()).toBe(0);

    expect(games[1].scheduledAt.getDate()).toBe(5);
    expect(games[1].scheduledAt.getHours()).toBe(11);
    expect(games[1].scheduledAt.getMinutes()).toBe(30);

    // Round 2 rolls to the following Saturday.
    expect(games[2].scheduledAt.getDate()).toBe(12);
    expect(games[4].scheduledAt.getDate()).toBe(19);
  });

  it('starts on the first configured weekday on or after the start date', () => {
    const { rows } = assignDates(rounds, { ...baseOptions, startDate: '2026-09-07' }); // Monday
    const first = rows.find((row) => !row.isBye);

    expect(first.scheduledAt.getDay()).toBe(SATURDAY);
    expect(first.scheduledAt.getDate()).toBe(12);
  });

  it('flags every row that had to move because slots ran out', () => {
    const { rows, overflowCount } = assignDates(rounds, { ...baseOptions, slots: ['10:00'] });
    const games = rows.filter((row) => !row.isBye);

    expect(overflowCount).toBeGreaterThan(0);
    expect(games.filter((game) => game.overflowed)).toHaveLength(overflowCount);
    expect(games.every((game) => game.scheduledAt.getDay() === SATURDAY)).toBe(true);
  });

  it('reports no overflow when the slots fit', () => {
    expect(assignDates(rounds, baseOptions).overflowCount).toBe(0);
  });

  it('cycles through multiple configured weekdays in calendar order', () => {
    const { rows } = assignDates(rounds, { ...baseOptions, weekdays: [SATURDAY, SUNDAY] });
    const games = rows.filter((row) => !row.isBye);

    expect(games[0].scheduledAt.getDay()).toBe(SATURDAY);
    expect(games[2].scheduledAt.getDay()).toBe(SUNDAY);
    expect(games[2].scheduledAt.getDate()).toBe(6);
  });

  it('applies the default venue to every game row', () => {
    const { rows } = assignDates(rounds, { ...baseOptions, venue: 'Main Court' });

    expect(rows.filter((row) => !row.isBye).every((row) => row.venue === 'Main Court')).toBe(true);
  });

  it('defaults the venue to an empty string', () => {
    const { rows } = assignDates(rounds, baseOptions);

    expect(rows.filter((row) => !row.isBye).every((row) => row.venue === '')).toBe(true);
  });

  it('emits a bye row carrying the resting team', () => {
    const { rows } = assignDates(buildRoundRobin(['a', 'b', 'c']), {
      ...baseOptions,
      slots: ['10:00'],
    });
    const byes = rows.filter((row) => row.isBye);

    expect(byes).toHaveLength(3);
    expect(byes.every((bye) => typeof bye.byeTeamId === 'string')).toBe(true);
    expect(byes.every((bye) => bye.scheduledAt === undefined)).toBe(true);
  });

  it('gives every row a unique id', () => {
    const { rows } = assignDates(rounds, baseOptions);

    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  it('returns nothing when required options are missing', () => {
    expect(assignDates(rounds, { ...baseOptions, slots: [] }).rows).toEqual([]);
    expect(assignDates(rounds, { ...baseOptions, weekdays: [] }).rows).toEqual([]);
    expect(assignDates([], baseOptions).rows).toEqual([]);
  });
});
