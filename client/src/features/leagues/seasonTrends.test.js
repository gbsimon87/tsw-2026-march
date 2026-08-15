import { describe, expect, test } from 'vitest';
import { buildSeasonFormByTeam, RECENT_FORM_LIMIT } from './seasonTrends';

function completedGame(overrides = {}) {
  return {
    id: 'game-1',
    status: 'completed',
    completedAt: '2026-03-01T18:00:00.000Z',
    scheduledAt: '2026-03-01T17:00:00.000Z',
    homeLeagueTeamId: 'team-a',
    awayLeagueTeamId: 'team-b',
    homeTeamName: 'Falcons',
    awayTeamName: 'Bears',
    homePoints: 72,
    awayPoints: 65,
    ...overrides,
  };
}

describe('buildSeasonFormByTeam', () => {
  test('returns inverse results for both teams with opponent and score context', () => {
    const form = buildSeasonFormByTeam([completedGame()]);

    expect(form.get('team-a')).toEqual([
      expect.objectContaining({
        gameId: 'game-1',
        result: 'win',
        opponentTeamName: 'Bears',
        teamPoints: 72,
        opponentPoints: 65,
      }),
    ]);
    expect(form.get('team-b')).toEqual([
      expect.objectContaining({
        gameId: 'game-1',
        result: 'loss',
        opponentTeamName: 'Falcons',
        teamPoints: 65,
        opponentPoints: 72,
      }),
    ]);
  });

  test('shows the latest five chronologically with the newest result on the right', () => {
    const games = Array.from({ length: RECENT_FORM_LIMIT + 1 }, (_, index) =>
      completedGame({
        id: `game-${index + 1}`,
        completedAt: `2026-03-${String(index + 1).padStart(2, '0')}T18:00:00.000Z`,
        homePoints: index % 2 === 0 ? 80 : 60,
        awayPoints: 70,
      })
    );

    const form = buildSeasonFormByTeam(games);

    expect(form.get('team-a').map((result) => result.gameId)).toEqual([
      'game-2',
      'game-3',
      'game-4',
      'game-5',
      'game-6',
    ]);
  });

  test('ignores unfinished or scoreless games and preserves legacy ties', () => {
    const form = buildSeasonFormByTeam([
      completedGame({ id: 'scheduled', status: 'scheduled', homePoints: null, awayPoints: null }),
      completedGame({ id: 'scoreless', homePoints: null }),
      completedGame({ id: 'tie', homePoints: 70, awayPoints: 70 }),
    ]);

    expect(form.get('team-a')).toEqual([expect.objectContaining({ gameId: 'tie', result: 'tie' })]);
    expect(form.get('team-b')).toEqual([expect.objectContaining({ gameId: 'tie', result: 'tie' })]);
  });
});
