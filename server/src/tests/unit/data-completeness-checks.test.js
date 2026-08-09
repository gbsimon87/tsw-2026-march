const {
  buildGameIssues,
  buildRosterIssues,
  MIN_ACTIVE_ROSTER,
  OVERDUE_AFTER_MS,
  SEVERITY,
} = require('../../modules/leagues/dataCompleteness.checks');

const NOW = new Date('2026-08-09T12:00:00.000Z');
const HOME_ID = '507f1f77bcf86cd799439031';
const AWAY_ID = '507f1f77bcf86cd799439032';
const GAME_ID = '507f1f77bcf86cd799439051';

const TEAMS_BY_ID = new Map([
  [HOME_ID, { id: HOME_ID, name: 'Ballers' }],
  [AWAY_ID, { id: AWAY_ID, name: 'Hoops' }],
]);

function game(overrides = {}) {
  return {
    id: GAME_ID,
    status: 'scheduled',
    scheduledAt: new Date(NOW.getTime() - 60 * 60 * 1000),
    venue: 'Court 1',
    trackingMode: 'one_sided',
    homeLeagueTeamId: HOME_ID,
    awayLeagueTeamId: AWAY_ID,
    trackedLeagueTeamId: HOME_ID,
    events: [{ type: 'shot' }],
    ...overrides,
  };
}

function run(games) {
  return buildGameIssues({ games, teamsById: TEAMS_BY_ID, now: NOW });
}

describe('buildGameIssues', () => {
  it('does not flag a scheduled game 47 hours past tip-off', () => {
    const scheduledAt = new Date(NOW.getTime() - 47 * 60 * 60 * 1000);
    const issues = run([game({ scheduledAt })]);
    expect(issues.filter((i) => i.checkType === 'overdue_game')).toHaveLength(0);
  });

  it('flags a scheduled game 49 hours past tip-off as overdue', () => {
    const scheduledAt = new Date(NOW.getTime() - 49 * 60 * 60 * 1000);
    const issues = run([game({ scheduledAt })]);
    const overdue = issues.filter((i) => i.checkType === 'overdue_game');
    expect(overdue).toHaveLength(1);
    expect(overdue[0].severity).toBe(SEVERITY.HIGH);
    expect(overdue[0].issueKey).toBe(`overdue_game:${GAME_ID}`);
    expect(overdue[0].label).toBe('Hoops at Ballers');
  });

  it('flags an in_progress game past the overdue window', () => {
    const scheduledAt = new Date(NOW.getTime() - 49 * 60 * 60 * 1000);
    const issues = run([game({ status: 'in_progress', scheduledAt })]);
    expect(issues.filter((i) => i.checkType === 'stuck_in_progress')).toHaveLength(1);
  });

  it('exports the 48 hour threshold as a constant', () => {
    expect(OVERDUE_AFTER_MS).toBe(48 * 60 * 60 * 1000);
  });

  it('does not flag a completed one-sided game whose tracked side has events', () => {
    const issues = run([game({ status: 'completed' })]);
    expect(issues.filter((i) => i.checkType === 'missing_box_score')).toHaveLength(0);
  });

  it('flags a completed game with no events at all', () => {
    const issues = run([game({ status: 'completed', events: [] })]);
    const missing = issues.filter((i) => i.checkType === 'missing_box_score');
    expect(missing).toHaveLength(1);
    expect(missing[0].severity).toBe(SEVERITY.HIGH);
  });

  it('flags a future scheduled game with no venue', () => {
    const scheduledAt = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const issues = run([game({ scheduledAt, venue: null })]);
    const noVenue = issues.filter((i) => i.checkType === 'no_venue');
    expect(noVenue).toHaveLength(1);
    expect(noVenue[0].severity).toBe(SEVERITY.LOW);
  });

  it('treats a blank venue string as missing', () => {
    const scheduledAt = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const issues = run([game({ scheduledAt, venue: '   ' })]);
    expect(issues.filter((i) => i.checkType === 'no_venue')).toHaveLength(1);
  });

  it('does not raise a venue warning for a game already past', () => {
    const scheduledAt = new Date(NOW.getTime() - 49 * 60 * 60 * 1000);
    const issues = run([game({ scheduledAt, venue: null })]);
    expect(issues.filter((i) => i.checkType === 'no_venue')).toHaveLength(0);
  });

  it('gives every issue a link to where it gets fixed', () => {
    const scheduledAt = new Date(NOW.getTime() - 49 * 60 * 60 * 1000);
    const issues = run([game({ scheduledAt })]);
    expect(issues[0].href).toBe(`/admin/games/${GAME_ID}`);
  });
});

const TEAM_ID = '507f1f77bcf86cd799439031';
const USER_ID = '507f1f77bcf86cd799439061';

function player(index, overrides = {}) {
  return {
    id: `50000000000000000000000${index}`,
    leagueTeamId: TEAM_ID,
    displayName: `Player ${index}`,
    jerseyNumber: index,
    isActive: true,
    claimedByUserId: USER_ID,
    ...overrides,
  };
}

function roster(count, overrides = {}) {
  return Array.from({ length: count }, (_, i) => player(i + 1, overrides));
}

function runRoster({ players, teams, stats, completed } = {}) {
  const list = players ?? roster(5);
  return buildRosterIssues({
    teams: teams ?? [{ id: TEAM_ID, name: 'Ballers', logo: { url: 'x' } }],
    players: list,
    statsByPlayerId: stats ?? new Map(list.map((p) => [p.id, { gamesCount: 3 }])),
    completedGameTeamIds: completed ?? new Set([TEAM_ID]),
  });
}

describe('buildRosterIssues', () => {
  it('flags a team with 4 active players', () => {
    const issues = runRoster({ players: roster(4) });
    const small = issues.filter((i) => i.checkType === 'roster_too_small');
    expect(small).toHaveLength(1);
    expect(small[0].severity).toBe(SEVERITY.MEDIUM);
  });

  it('does not flag a team with exactly 5 active players', () => {
    const issues = runRoster({ players: roster(5) });
    expect(issues.filter((i) => i.checkType === 'roster_too_small')).toHaveLength(0);
  });

  it('exports the minimum roster size as a constant', () => {
    expect(MIN_ACTIVE_ROSTER).toBe(5);
  });

  it('ignores inactive players when counting the roster', () => {
    const players = [...roster(4), player(9, { isActive: false })];
    const issues = runRoster({ players });
    expect(issues.filter((i) => i.checkType === 'roster_too_small')).toHaveLength(1);
  });

  it('flags an active player with no recorded appearances', () => {
    const players = roster(5);
    const stats = new Map(players.map((p) => [p.id, { gamesCount: 3 }]));
    stats.set(players[0].id, { gamesCount: 0 });
    const issues = runRoster({ players, stats });
    const none = issues.filter((i) => i.checkType === 'no_appearances');
    expect(none).toHaveLength(1);
    expect(none[0].severity).toBe(SEVERITY.MEDIUM);
  });

  it('does not flag zero appearances when the team has played no completed games', () => {
    const players = roster(5);
    const stats = new Map(players.map((p) => [p.id, { gamesCount: 0 }]));
    const issues = runRoster({ players, stats, completed: new Set() });
    expect(issues.filter((i) => i.checkType === 'no_appearances')).toHaveLength(0);
  });

  it('treats a missing stats row as zero appearances', () => {
    const players = roster(5);
    const issues = runRoster({ players, stats: new Map() });
    expect(issues.filter((i) => i.checkType === 'no_appearances')).toHaveLength(5);
  });

  it('flags a player with no jersey number', () => {
    const players = [...roster(4), player(5, { jerseyNumber: null })];
    const issues = runRoster({ players });
    const noJersey = issues.filter((i) => i.checkType === 'missing_jersey');
    expect(noJersey).toHaveLength(1);
    expect(noJersey[0].severity).toBe(SEVERITY.LOW);
  });

  it('treats jersey number 0 as present', () => {
    const players = [...roster(4), player(5, { jerseyNumber: 0 })];
    const issues = runRoster({ players });
    expect(issues.filter((i) => i.checkType === 'missing_jersey')).toHaveLength(0);
  });

  it('flags an unclaimed active player', () => {
    const players = [...roster(4), player(5, { claimedByUserId: null })];
    const issues = runRoster({ players });
    const unclaimed = issues.filter((i) => i.checkType === 'unclaimed_player');
    expect(unclaimed).toHaveLength(1);
    expect(unclaimed[0].severity).toBe(SEVERITY.LOW);
  });

  it('does not flag a claimed player regardless of avatar', () => {
    const issues = runRoster({ players: roster(5) });
    expect(issues.filter((i) => i.checkType === 'unclaimed_player')).toHaveLength(0);
  });

  it('flags a team with no logo', () => {
    const teams = [{ id: TEAM_ID, name: 'Ballers', logo: null }];
    const issues = runRoster({ teams });
    const noLogo = issues.filter((i) => i.checkType === 'no_logo');
    expect(noLogo).toHaveLength(1);
    expect(noLogo[0].severity).toBe(SEVERITY.LOW);
  });

  it('tags every roster issue with its team for per-team filtering', () => {
    const issues = runRoster({ players: roster(4) });
    expect(issues.every((i) => i.leagueTeamId === TEAM_ID)).toBe(true);
  });
});
