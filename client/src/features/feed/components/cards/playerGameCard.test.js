import { describe, expect, it } from 'vitest';

import { buildPlayerGameCard, hasShareableLine, pickContextStat } from './playerGameCard';

const line = (overrides = {}) => ({
  points: 12,
  reb: 4,
  ast: 3,
  stl: 0,
  blk: 0,
  fg2m: 4,
  fg2a: 9,
  fg3m: 0,
  fg3a: 2,
  ftm: 4,
  fta: 5,
  tov: 1,
  foul: 2,
  ...overrides,
});

// Every branch reports something the box score actually recorded — the picker
// may never compute a stat that wasn't tracked.
describe('pickContextStat', () => {
  it('leads with three-pointers once there are three of them', () => {
    expect(pickContextStat(line({ fg3m: 3 }))).toEqual({ label: '3-pointers', value: '3' });
  });

  it('reports blocks when the three-point line is quiet', () => {
    expect(pickContextStat(line({ fg3m: 2, blk: 2 }))).toEqual({ label: 'Blocks', value: '2' });
  });

  it('reports steals when there are no threes or blocks to report', () => {
    expect(pickContextStat(line({ blk: 1, stl: 3 }))).toEqual({ label: 'Steals', value: '3' });
  });

  it('falls back to the combined field-goal line', () => {
    expect(pickContextStat(line())).toEqual({ label: 'Field goals', value: '4/11' });
  });

  it('shows a zeroed field-goal line rather than inventing a stat', () => {
    expect(pickContextStat(line({ fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0 }))).toEqual({
      label: 'Field goals',
      value: '0/0',
    });
  });

  it('prefers the higher-signal stat when several clear their threshold', () => {
    expect(pickContextStat(line({ fg3m: 4, blk: 3, stl: 5 }))).toEqual({
      label: '3-pointers',
      value: '4',
    });
  });
});

describe('buildPlayerGameCard', () => {
  const gameData = {
    game: { id: 'game-1', trackingMode: 'one_sided', opponent: 'Hawks', scheduledAt: '2026-09-12' },
    team: {
      id: 'team-1',
      name: 'Falcons',
      logo: { url: 'https://cdn/falcons.png' },
      colors: ['#111'],
    },
    gameSummary: { teamPoints: 78, opponentPoints: 64, hasOpponentScore: true },
    recap: { opponent: { name: 'Hawks' } },
  };
  const row = {
    playerId: 'p1',
    displayName: 'Jordan Lee',
    ...line({ points: 28, reb: 9, ast: 5 }),
  };

  it('assembles the card the exporter renders', () => {
    const card = buildPlayerGameCard({
      data: gameData,
      row,
      rosterPlayer: { id: 'p1', jerseyNumber: 23, avatarUrl: 'https://cdn/jordan.png' },
    });

    expect(card).toMatchObject({
      gameId: 'game-1',
      gameUrl: '/games/game-1',
      playerName: 'Jordan Lee',
      jerseyNumber: 23,
      playerImage: { url: 'https://cdn/jordan.png' },
      imageFallback: 'player',
      teamName: 'Falcons',
      opponentName: 'Hawks',
      resultLabel: 'W 78–64',
      stats: { points: 28, reb: 9, ast: 5 },
    });
  });

  it('records that it fell back to the team logo', () => {
    const card = buildPlayerGameCard({
      data: gameData,
      row,
      rosterPlayer: { id: 'p1', jerseyNumber: 23, avatarUrl: null },
    });

    expect(card.playerImage).toBeNull();
    expect(card.imageFallback).toBe('team_logo');
  });

  it('omits the result when the opponent score was never tracked', () => {
    const card = buildPlayerGameCard({
      data: {
        ...gameData,
        gameSummary: { teamPoints: 78, opponentPoints: 0, hasOpponentScore: false },
      },
      row,
      rosterPlayer: null,
    });

    expect(card.resultLabel).toBeNull();
  });

  it('reads the away side of a dual-team game', () => {
    const card = buildPlayerGameCard({
      data: {
        game: { id: 'game-2', trackingMode: 'dual_team', scheduledAt: '2026-09-12' },
        participants: {
          home: { displayName: 'Rockets', logo: null, colors: [] },
          away: {
            displayName: 'Comets',
            logo: { url: 'https://cdn/comets.png' },
            colors: ['#222'],
          },
        },
        gameSummary: { homePoints: 70, awayPoints: 81 },
      },
      row,
      rosterPlayer: null,
      side: 'away',
    });

    expect(card).toMatchObject({
      teamName: 'Comets',
      opponentName: 'Rockets',
      resultLabel: 'W 81–70',
    });
  });
});

// A card reading 0/0/0 is not worth sharing, and the team-total row is not a
// player at all — the row action stays hidden for both.
describe('hasShareableLine', () => {
  it('accepts a row with any recorded production', () => {
    expect(hasShareableLine({ points: 0, reb: 0, ast: 0, stl: 1, blk: 0 })).toBe(true);
  });

  it('rejects a player who recorded nothing', () => {
    expect(hasShareableLine({ points: 0, reb: 0, ast: 0, stl: 0, blk: 0 })).toBe(false);
  });

  it('rejects the team-total row however big its line is', () => {
    expect(hasShareableLine({ points: 78, reb: 40, isTeamTotal: true })).toBe(false);
  });

  it('rejects a missing row', () => {
    expect(hasShareableLine(null)).toBe(false);
  });
});
