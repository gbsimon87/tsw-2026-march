import { describe, expect, test } from 'vitest';
import { buildWeeklyRecap } from './weeklyRecap';
import { recapData } from './components/weeklyRecapFixture';
describe('published weekly recaps', () => {
  test('does not build draft recaps, including admin preview aggregates', () => {
    expect(
      buildWeeklyRecap({ ...recapData, session: { ...recapData.session, publishedAt: null } })
    ).toBeNull();
  });
  test('uses only supplied weekly totals, eligible MVP and completed game count', () => {
    const recap = buildWeeklyRecap({ ...recapData, origin: 'https://thesportyway.com' });
    expect(recap.url).toBe('https://thesportyway.com/scrimmage/series-1/sessions/week-1?tab=recap');
    expect(recap.completedGames).toBe(1);
    expect(recap.winner.displayName).toBe('John');
    expect(recap.caption).toContain(
      'John: 12 points · 50.0% FG · 2 turnovers · 3 games · MVP 3.50'
    );
    expect(recap.caption).toContain(
      'Kyle: 8 points · — FG · 1 turnover · 1 game · MVP 9.00 (provisional)'
    );
    expect(recap.caption).toContain('Minimum 3 games.');
    expect(recap.players[0].playsPath).toBe(
      '/scrimmage/series-1/players/john?seasonId=season-1&sessionId=week-1'
    );
  });
  test('does not award a provisional player and supports empty published weeks', () => {
    const recap = buildWeeklyRecap({ ...recapData, standings: [recapData.standings[1]] });
    expect(recap.winner).toBeNull();
    expect(recap.caption).toContain('No eligible weekly MVP yet.');
    expect(buildWeeklyRecap({ ...recapData, standings: [], games: [] }).completedGames).toBe(0);
  });
});
