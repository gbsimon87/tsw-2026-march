import { describe, expect, it } from 'vitest';

import { LEADERBOARD_KINDS, buildLeaderboardCards } from './leaderboardCards';

const league = { name: 'Southside Hoops', slug: 'southside-hoops' };

function category(key, abbreviation, statKey, rows) {
  return {
    key,
    statKey,
    abbreviation,
    label: `${key[0].toUpperCase()}${key.slice(1)} per game`,
    qualifiedCount: rows.length,
    rows,
  };
}

function player(displayName, value, statKey, overrides = {}) {
  return {
    displayName,
    leaguePlayerId: displayName.toLowerCase().replace(/\W+/g, '-'),
    teamName: 'Alpha',
    gamesCount: 4,
    [statKey]: value,
    ...overrides,
  };
}

const categoryLeaders = [
  category('points', 'PPG', 'ppg', [
    player('Jordan Blake', 24.4, 'ppg'),
    player('Sam Reed', 19.25, 'ppg'),
    player('Cara Pace', 12, 'ppg'),
  ]),
  // Suppressed by the server: fewer than three qualified players.
  category('rebounds', 'RPG', 'rpg', []),
  category('assists', 'APG', 'apg', [
    player('Alex Moss', 7.5, 'apg'),
    player('Kim Lowe', 6, 'apg'),
    player('Pat Vance', 4.2, 'apg'),
  ]),
];

const standings = [
  { teamId: 't1', teamName: 'Alpha', record: '6-1', wins: 6, losses: 1, pointDiff: 58 },
  { teamId: 't2', teamName: 'Bravo', record: '5-2', wins: 5, losses: 2, pointDiff: 31 },
  { teamId: 't3', teamName: 'Charlie', record: '3-4', wins: 3, losses: 4, pointDiff: -12 },
];

const formByTeam = new Map([
  ['t1', [{ result: 'win' }, { result: 'win' }, { result: 'loss' }, { result: 'win' }]],
  ['t2', [{ result: 'loss' }, { result: 'tie' }]],
]);

function build(overrides = {}) {
  return buildLeaderboardCards({
    league,
    categoryLeaders,
    standings,
    formByTeam,
    seasonLabel: '2026 Season',
    ...overrides,
  });
}

describe('buildLeaderboardCards', () => {
  it('omits a category the server suppressed rather than showing an empty podium', () => {
    expect(build().map((card) => card.kind)).toEqual(['points', 'assists', 'table']);
    expect(LEADERBOARD_KINDS).toContain('rebounds');
  });

  it('ranks and formats each leader, carrying the sample behind the average', () => {
    const [points] = build();

    expect(points.kicker).toBe('PPG LEADERS');
    expect(points.serial).toBe('2026 Season');
    expect(points.rows).toEqual([
      {
        rank: 1,
        name: 'Jordan Blake',
        // Carried so the export guard can mask one row without touching the
        // others (social backlog rank 9).
        leaguePlayerId: 'jordan-blake',
        teamName: 'Alpha',
        value: '24.4',
        gamesCount: 4,
      },
      {
        rank: 2,
        name: 'Sam Reed',
        leaguePlayerId: 'sam-reed',
        teamName: 'Alpha',
        value: '19.3',
        gamesCount: 4,
      },
      {
        rank: 3,
        name: 'Cara Pace',
        leaguePlayerId: 'cara-pace',
        teamName: 'Alpha',
        value: '12.0',
        gamesCount: 4,
      },
    ]);
  });

  it('describes a leaders card for a screen reader', () => {
    expect(build()[0].altText).toBe(
      'Southside Hoops points per game leaders: 1. Jordan Blake 24.4, 2. Sam Reed 19.3, 3. Cara Pace 12.0.'
    );
  });

  it('builds the table card with record, differential and recent form', () => {
    const table = build().find((card) => card.kind === 'table');

    expect(table.rows[0]).toEqual({
      rank: 1,
      name: 'Alpha',
      record: '6-1',
      pointDiff: 58,
      form: ['W', 'W', 'L', 'W'],
    });
    // A team with no recorded form gets an empty run, not a row of dashes.
    expect(table.rows[2].form).toEqual([]);
    expect(table.altText).toContain('1. Alpha 6-1, form WWLW');
  });

  it('maps a tie to D and keeps only the last five results', () => {
    const longForm = new Map([
      ['t1', Array.from({ length: 8 }, (_, index) => ({ result: index === 7 ? 'tie' : 'win' }))],
    ]);
    const table = build({ formByTeam: longForm }).find((card) => card.kind === 'table');

    expect(table.rows[0].form).toEqual(['W', 'W', 'W', 'W', 'D']);
  });

  it('falls back to a wins-losses record when the server sent none', () => {
    const withoutRecord = standings.map((row) => {
      const copy = { ...row };
      delete copy.record;
      return copy;
    });
    const table = build({ standings: withoutRecord }).find((card) => card.kind === 'table');

    expect(table.rows[0].record).toBe('6-1');
  });

  it('suppresses the table below three teams, because two is a fixture list', () => {
    expect(build({ standings: standings.slice(0, 2) }).some((card) => card.kind === 'table')).toBe(
      false
    );
  });

  it('caps the table at five teams', () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      teamId: `t${index}`,
      teamName: `Team ${index}`,
      record: '1-0',
      pointDiff: index,
    }));
    const table = build({ standings: many }).find((card) => card.kind === 'table');

    expect(table.rows).toHaveLength(5);
  });

  it('honours a caller-supplied selection and order', () => {
    expect(build({ only: ['table', 'points'] }).map((card) => card.kind)).toEqual([
      'table',
      'points',
    ]);
  });

  it('builds nothing at all from an empty league', () => {
    expect(buildLeaderboardCards({})).toEqual([]);
  });
});
