import { describe, expect, test } from 'vitest';
import { buildGameSocialKit } from './gameSocialKit';
import { guardCard, guardGamePayload, resolveExportGuard } from './exportGuard';

const granted = {
  canFeature: true,
  scope: 'league',
  orgName: 'Demo League',
  restrictedPlayerIds: [],
};

describe('social export guard', () => {
  test('missing permission blocks exports and does not attach a handle', () => {
    expect(resolveExportGuard(null).canExport).toBe(false);
    const result = guardCard(
      'team_card',
      { teamId: 't1', teamName: 'Falcons' },
      {
        canFeature: false,
        scope: 'league',
        reason: 'permission_not_recorded',
        handles: { t1: { instagram: '@falcons' } },
      }
    );
    expect(result.guard.canExport).toBe(false);
    expect(result.card.teamInstagramHandle).toBeUndefined();
  });

  test('restricted player card loses name, face and full-name alt text', () => {
    const result = guardCard(
      'player_game_card',
      {
        playerId: 'p1',
        playerName: 'Jordan Blake',
        playerImage: { url: 'https://cdn.example/jordan.png' },
        playerAvatarUrl: 'https://cdn.example/jordan.png',
        jerseyNumber: 23,
        playerUrl: '/players/p1',
        altText: 'Jordan Blake scored 28 points',
      },
      { ...granted, restrictedPlayerIds: ['p1'] }
    );
    expect(result.guard.clearance).toBe('restricted');
    expect(result.guard.canExport).toBe(false);
    expect(result.card).toMatchObject({
      playerName: 'J. B.',
      playerImage: null,
      playerAvatarUrl: null,
      jerseyNumber: null,
      playerUrl: null,
    });
    expect(result.card.altText).not.toContain('Jordan Blake');
  });

  test('a restricted milestone cannot be exported even when its label names the player', () => {
    const result = guardCard(
      'milestone',
      { playerName: 'Jordan Blake', label: 'Jordan Blake reached 1,000 points' },
      { ...granted, restrictedPlayerIds: ['p1'] }
    );
    expect(result.guard.canExport).toBe(false);
    expect(result.card.label).not.toContain('Jordan Blake');
  });

  test('leaderboards omit restricted identities and suppress a short cleared ranking', () => {
    const card = {
      kind: 'points',
      label: 'Scoring',
      leagueName: 'Demo League',
      rows: [
        { rank: 1, leaguePlayerId: 'p1', name: 'Jordan Blake', teamName: 'Blue', value: '28' },
        { rank: 2, leaguePlayerId: 'p2', name: 'Alex Day', teamName: 'Gold', value: '20' },
        { rank: 3, leaguePlayerId: 'p3', name: 'Sam Fox', teamName: 'Red', value: '18' },
        { rank: 4, leaguePlayerId: 'p4', name: 'Lee Park', teamName: 'Green', value: '16' },
      ],
      altText: 'Jordan Blake leads scoring',
    };
    const marketing = { ...granted, restrictedPlayerIds: ['p1'] };
    const result = guardCard('leaderboard_card', card, marketing);
    expect(result.card.rows.map((row) => row.name)).toEqual(['Alex Day', 'Sam Fox', 'Lee Park']);
    expect(result.card.rows.map((row) => row.rank)).toEqual([1, 2, 3]);
    expect(JSON.stringify(result.card)).not.toContain('Jordan Blake');
    expect(result.guard.clearance).toBe('restricted');
    expect(
      guardCard('leaderboard_card', { ...card, rows: card.rows.slice(0, 3) }, marketing).card
    ).toBeNull();
  });

  test('the completed-game kit cannot rebuild a restricted player card from the box score', () => {
    const data = {
      game: { id: 'g1', status: 'completed', trackingMode: 'one_sided', opponent: 'Falcons' },
      team: {
        id: 't1',
        name: 'TSW Blue',
        players: [{ id: 'p1', avatarUrl: 'https://cdn.example/jordan.png' }],
      },
      boxScore: {
        players: [{ playerId: 'p1', displayName: 'Jordan Blake', points: 28, reb: 9, ast: 6 }],
      },
      recap: {
        team: { name: 'TSW Blue', points: 70 },
        opponent: { name: 'Falcons', points: 61 },
        topPerformers: [
          { playerId: 'p1', displayName: 'Jordan Blake', points: 28, reb: 9, ast: 6 },
        ],
      },
    };
    const { data: guardedData, guard } = guardGamePayload(data, {
      ...granted,
      restrictedPlayerIds: ['p1'],
    });
    const kit = buildGameSocialKit(guardedData);
    expect(guard.clearance).toBe('restricted');
    expect(guardedData.recap.topPerformers).toEqual([]);
    expect(kit.assets.some((asset) => asset.type === 'player_game_card')).toBe(false);
    expect(JSON.stringify(kit)).not.toContain('Jordan Blake');
  });
});
