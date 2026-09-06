import { describe, expect, test } from 'vitest';
import { createParticipantIndex, resolveParticipant } from './resolveParticipant';

const playersBySide = {
  home: [
    { id: 'zero', displayName: "José O'Neal", jerseyNumber: 0, isActive: true },
    { id: 'mary', displayName: 'Mary-Jane Smith', jerseyNumber: 13, isActive: true },
    { id: 'jordan', displayName: 'Jordan Lee', jerseyNumber: 13, isActive: true },
    { id: 'bench', displayName: 'Blake Bench', jerseyNumber: 7, isActive: true },
    { id: 'inactive', displayName: 'Inactive Ian', jerseyNumber: 8, isActive: false },
  ],
  away: [{ id: 'away-alex', displayName: 'Alex Away', jerseyNumber: 4, isActive: true }],
};

const index = createParticipantIndex({
  trackingMode: 'dual_team',
  playersBySide,
  lineupIdsBySide: {
    home: ['zero', 'mary', 'jordan', 'inactive'],
    away: ['away-alex'],
  },
});

function resolve(side, participant, options = {}) {
  return resolveParticipant(index, { side, participant, ...options });
}

describe('resolveParticipant', () => {
  test('preserves jersey zero and resolves only exact matches', () => {
    expect(resolve('home', { kind: 'jersey', value: 0 })).toMatchObject({
      ok: true,
      playerId: 'zero',
      side: 'home',
    });
    expect(resolve('home', { kind: 'name', value: 'jose oneal' })).toMatchObject({
      ok: true,
      playerId: 'zero',
    });
    expect(resolve('home', { kind: 'name', value: 'Mary Jane Smith' })).toMatchObject({
      ok: true,
      playerId: 'mary',
    });
  });

  test('reports duplicate jersey and duplicate name matches as ambiguous', () => {
    expect(resolve('home', { kind: 'jersey', value: 13 })).toEqual({
      ok: false,
      reason: 'ambiguous',
    });

    const duplicateNameIndex = createParticipantIndex({
      trackingMode: 'one_sided',
      playersBySide: {
        tracked: [
          { id: 'one', displayName: 'Alex Smith', isActive: true },
          { id: 'two', displayName: 'Alex Jones', isActive: true },
        ],
      },
      lineupIdsBySide: { tracked: ['one', 'two'] },
    });
    expect(
      resolveParticipant(duplicateNameIndex, {
        side: null,
        participant: { kind: 'name', value: 'Alex' },
      })
    ).toEqual({ ok: false, reason: 'ambiguous' });
  });

  test.each([
    [{ kind: 'jersey', value: 7 }, 'off_court'],
    [{ kind: 'jersey', value: 8 }, 'inactive'],
    [{ kind: 'jersey', value: 99 }, 'not_found'],
  ])('returns a typed rejection for %j', (participant, reason) => {
    expect(resolve('home', participant)).toEqual({ ok: false, reason });
  });

  test('enforces a prompt-limited participant pool', () => {
    expect(
      resolve('home', { kind: 'name', value: 'Mary Jane Smith' }, { allowedPlayerIds: ['zero'] })
    ).toEqual({ ok: false, reason: 'not_allowed' });
  });

  test('fails closed for a missing or invalid side', () => {
    expect(resolve(null, { kind: 'jersey', value: 0 })).toEqual({
      ok: false,
      reason: 'missing_side',
    });
    expect(resolve('neutral', { kind: 'jersey', value: 0 })).toEqual({
      ok: false,
      reason: 'invalid_side',
    });
  });
});
