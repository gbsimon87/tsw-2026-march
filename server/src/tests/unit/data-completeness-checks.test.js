const {
  buildGameIssues,
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
