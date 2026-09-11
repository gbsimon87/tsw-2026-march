import { describe, expect, test } from 'vitest';
import { basketballVoiceAdapter } from './basketballVoiceAdapter';

const dualContext = { trackingMode: 'dual_team' };
const oneSidedContext = { trackingMode: 'one_sided' };

function parsePrimary(transcript, context = dualContext) {
  return basketballVoiceAdapter.parsePrimary(transcript, context);
}

describe('basketballVoiceAdapter primary commands', () => {
  test.each([
    [
      'home 13 made',
      {
        kind: 'primary',
        side: 'home',
        participant: { kind: 'jersey', value: 13 },
        action: 'field_goal',
        outcome: 'made',
        points: null,
      },
    ],
    [
      'Away, number seven missed!',
      {
        kind: 'primary',
        side: 'away',
        participant: { kind: 'jersey', value: 7 },
        action: 'field_goal',
        outcome: 'miss',
        points: null,
      },
    ],
    [
      'home Alex Morgan made a three',
      {
        kind: 'primary',
        side: 'home',
        participant: { kind: 'name', value: 'alex morgan' },
        action: 'field_goal',
        outcome: 'made',
        points: 3,
      },
    ],
    [
      'home 13 too point miss',
      {
        kind: 'primary',
        side: 'home',
        participant: { kind: 'jersey', value: 13 },
        action: 'field_goal',
        outcome: 'miss',
        points: 2,
      },
    ],
    [
      '13 free throw miss',
      {
        kind: 'primary',
        side: null,
        participant: { kind: 'jersey', value: 13 },
        action: 'free_throw',
        outcome: 'miss',
      },
      oneSidedContext,
    ],
    [
      'away 7 defensive rebound',
      {
        kind: 'primary',
        side: 'away',
        participant: { kind: 'jersey', value: 7 },
        action: 'defensive_rebound',
      },
    ],
    [
      'home Alex steal',
      {
        kind: 'primary',
        side: 'home',
        participant: { kind: 'name', value: 'alex' },
        action: 'steal',
      },
    ],
    [
      '13 turnover',
      {
        kind: 'primary',
        side: null,
        participant: { kind: 'jersey', value: 13 },
        action: 'turnover',
      },
      oneSidedContext,
    ],
  ])('parses %s', (transcript, intent, context = dualContext) => {
    expect(parsePrimary(transcript, context)).toEqual({ ok: true, intent });
  });

  test('interprets homophones only in an expected number slot', () => {
    expect(parsePrimary('home number too block')).toMatchObject({
      ok: true,
      intent: { participant: { kind: 'jersey', value: 2 }, action: 'block' },
    });
    expect(parsePrimary('home too block')).toMatchObject({
      ok: true,
      intent: { participant: { kind: 'name', value: 'too' }, action: 'block' },
    });
  });

  test.each([
    ['', 'empty'],
    ['home made', 'missing_participant'],
    ['13 made', 'missing_side'],
    ['home 13 made', 'unexpected_side', oneSidedContext],
    ['home 13', 'incomplete'],
    ['home 13 made miss', 'conflicting_action'],
    ['home 13 made two three', 'conflicting_points'],
    ['home 13 travelled', 'unsupported_action'],
    ['undo now', 'unsupported_action'],
    ['home 13 free throw made miss', 'conflicting_action'],
    ['home 13 ' + 'word '.repeat(21), 'too_long'],
  ])('rejects %s with %s', (transcript, reason, context = dualContext) => {
    expect(parsePrimary(transcript, context)).toEqual({ ok: false, reason });
  });

  test('returns undo only as a standalone primary control', () => {
    expect(parsePrimary('undo', oneSidedContext)).toEqual({
      ok: true,
      intent: { kind: 'control', action: 'undo' },
    });
  });
});

describe('basketballVoiceAdapter spoken field-goal phrase', () => {
  test.each([
    ['21 field goal made', { outcome: 'made', points: null }],
    ['21 field goal miss', { outcome: 'miss', points: null }],
    ['21 made field goal', { outcome: 'made', points: null }],
    ['21 field goal made three', { outcome: 'made', points: 3 }],
    ['21 three point field goal made', { outcome: 'made', points: 3 }],
    ['21 3pt field goal missed', { outcome: 'miss', points: 3 }],
    ['21 two pointer made', { outcome: 'made', points: 2 }],
    ['21 made 2 points', { outcome: 'made', points: 2 }],
  ])('accepts %s as an explicit field goal', (transcript, expected) => {
    expect(basketballVoiceAdapter.parsePrimary(transcript, oneSidedContext)).toEqual({
      ok: true,
      intent: {
        kind: 'primary',
        side: null,
        participant: { kind: 'jersey', value: 21 },
        action: 'field_goal',
        ...expected,
      },
    });
  });

  test('rejects a field goal combined with a free throw', () => {
    expect(
      basketballVoiceAdapter.parsePrimary('21 field goal free throw made', oneSidedContext)
    ).toEqual({ ok: false, reason: 'conflicting_action' });
  });

  // A jersey followed by words the grammar does not know must not be smuggled through as a player
  // NAME. Doing so makes the resolver report "no player matched", blaming the player for what is
  // really an unsupported phrase.
  test.each(['21 jump shot made', '21 shot made', '21 dunk made'])(
    'reports unrecognised words rather than a bogus name for %s',
    (transcript) => {
      expect(basketballVoiceAdapter.parsePrimary(transcript, oneSidedContext)).toEqual({
        ok: false,
        reason: 'unrecognised_words',
      });
    }
  );

  test('still resolves a genuine multi-word name and a compound jersey number', () => {
    expect(basketballVoiceAdapter.parsePrimary('Alex Morgan made', oneSidedContext)).toMatchObject({
      ok: true,
      intent: { participant: { kind: 'name', value: 'alex morgan' } },
    });
    expect(basketballVoiceAdapter.parsePrimary('twenty three made', oneSidedContext)).toMatchObject(
      {
        ok: true,
        intent: { participant: { kind: 'jersey', value: 23 } },
      }
    );
  });
});

describe('basketballVoiceAdapter opponent scoring commands', () => {
  test.each([
    ['opponent +1', { kind: 'opponent_score', action: 'free_throw', outcome: 'made', points: 1 }],
    [
      'opponent plus two',
      { kind: 'opponent_score', action: 'field_goal', outcome: 'made', points: 2 },
    ],
    [
      'opponent plus too',
      { kind: 'opponent_score', action: 'field_goal', outcome: 'made', points: 2 },
    ],
    [
      'opponent three points',
      { kind: 'opponent_score', action: 'field_goal', outcome: 'made', points: 3 },
    ],
    [
      'opponent free throw made',
      { kind: 'opponent_score', action: 'free_throw', outcome: 'made', points: 1 },
    ],
    [
      'opponent 2pt field goal made',
      { kind: 'opponent_score', action: 'field_goal', outcome: 'made', points: 2 },
    ],
    [
      'opponent made a three',
      { kind: 'opponent_score', action: 'field_goal', outcome: 'made', points: 3 },
    ],
    [
      'opponent made',
      { kind: 'opponent_score', action: 'field_goal', outcome: 'made', points: null },
    ],
  ])('parses one-team %s', (transcript, intent) => {
    expect(parsePrimary(transcript, oneSidedContext)).toEqual({ ok: true, intent });
  });

  test.each([
    ['opponent free throw missed', 'unsupported_action', oneSidedContext],
    ['opponent four', 'unsupported_action', oneSidedContext],
    ['opponent plus plus two', 'unsupported_action', oneSidedContext],
    ['opponent made miss', 'conflicting_action', oneSidedContext],
    ['opponent made two three', 'conflicting_points', oneSidedContext],
    ['opponent plus two', 'opponent_score_unavailable', dualContext],
  ])('rejects %s with %s', (transcript, reason, context) => {
    expect(parsePrimary(transcript, context)).toEqual({ ok: false, reason });
  });
});

describe('basketballVoiceAdapter follow-up commands', () => {
  test.each([
    ['unassisted', { kind: 'answer', answer: 'unassisted', side: null, participant: null }],
    ['skip', { kind: 'control', action: 'skip' }],
    [
      'away number 7',
      {
        kind: 'answer',
        answer: null,
        side: 'away',
        participant: { kind: 'jersey', value: 7 },
      },
    ],
  ])('parses assist follow-up %s', (transcript, intent) => {
    expect(
      basketballVoiceAdapter.parseFollowUp(transcript, {
        kind: 'assist',
        trackingMode: 'dual_team',
      })
    ).toEqual({ ok: true, intent });
  });

  test('parses a standalone undo during a prompt as a control the page can refuse', () => {
    expect(
      basketballVoiceAdapter.parseFollowUp('undo', { kind: 'assist', trackingMode: 'one_sided' })
    ).toEqual({ ok: true, intent: { kind: 'control', action: 'undo' } });
  });

  test('allows opponent only for a one-sided rebound prompt', () => {
    expect(
      basketballVoiceAdapter.parseFollowUp('opponent', {
        kind: 'rebound',
        trackingMode: 'one_sided',
      })
    ).toEqual({
      ok: true,
      intent: { kind: 'answer', answer: 'opponent', side: null, participant: null },
    });
    expect(
      basketballVoiceAdapter.parseFollowUp('opponent', {
        kind: 'assist',
        trackingMode: 'one_sided',
      })
    ).toEqual({ ok: false, reason: 'unsupported_answer' });
  });

  test('does not accept primary actions while a prompt is active', () => {
    expect(
      basketballVoiceAdapter.parseFollowUp('home 13 made', {
        kind: 'rebound',
        trackingMode: 'dual_team',
      })
    ).toEqual({ ok: false, reason: 'unsupported_answer' });
  });
});
