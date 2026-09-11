import { parseSpokenNumber, prepareVoiceText } from '../voiceText';

const MADE_WORDS = new Set(['make', 'made']);
const MISS_WORDS = new Set(['miss', 'missed']);
const RESERVED_ACTION_WORDS = new Set([
  ...MADE_WORDS,
  ...MISS_WORDS,
  'free',
  'throw',
  'field',
  'goal',
  'rebound',
  'steal',
  'block',
  'turnover',
  'foul',
  'point',
  'points',
  'pointer',
  '2pt',
  '3pt',
]);

const SIMPLE_ACTIONS = [
  { phrase: ['defensive', 'rebound'], action: 'defensive_rebound' },
  { phrase: ['offensive', 'rebound'], action: 'offensive_rebound' },
  { phrase: ['steal'], action: 'steal' },
  { phrase: ['block'], action: 'block' },
  { phrase: ['turnover'], action: 'turnover' },
  { phrase: ['foul'], action: 'foul' },
];

function stripPhrase(tokens, phrase) {
  for (let index = 0; index + phrase.length <= tokens.length; index += 1) {
    if (phrase.every((word, offset) => tokens[index + offset] === word)) {
      return {
        found: true,
        tokens: [...tokens.slice(0, index), ...tokens.slice(index + phrase.length)],
      };
    }
  }
  return { found: false, tokens };
}

function failure(reason) {
  return { ok: false, reason };
}

function success(intent) {
  return { ok: true, intent };
}

function endsWith(tokens, phrase) {
  if (phrase.length > tokens.length) return false;
  return phrase.every((token, index) => token === tokens[tokens.length - phrase.length + index]);
}

function outcomeFor(token) {
  if (MADE_WORDS.has(token)) return 'made';
  if (MISS_WORDS.has(token)) return 'miss';
  return null;
}

function pointValue(tokens) {
  const normalized = tokens.filter((token) => !['a', 'point', 'points', 'pointer'].includes(token));
  if (normalized.length !== 1) return null;
  if (['2', '2pt', 'two', 'to', 'too'].includes(normalized[0])) return 2;
  if (['3', '3pt', 'three'].includes(normalized[0])) return 3;
  return null;
}

function parseParticipant(tokens) {
  if (tokens.length === 0) return null;
  if (tokens[0] === 'number' || tokens[0] === 'jersey') {
    const numberTokens = tokens
      .slice(1)
      .map((token) => (['to', 'too'].includes(token) ? 'two' : token));
    const value = parseSpokenNumber(numberTokens);
    return value == null ? null : { kind: 'jersey', value };
  }

  const value = parseSpokenNumber(tokens);
  if (value != null) return { kind: 'jersey', value };
  return { kind: 'name', value: tokens.join(' ') };
}

function splitSide(tokens, trackingMode) {
  const spokenSide = ['home', 'away'].includes(tokens[0]) ? tokens[0] : null;
  if (trackingMode === 'dual_team' && !spokenSide) return failure('missing_side');
  if (trackingMode !== 'dual_team' && spokenSide) return failure('unexpected_side');
  return {
    ok: true,
    side: spokenSide,
    tokens: spokenSide ? tokens.slice(1) : tokens,
  };
}

function hasConflictingOutcome(tokens) {
  return (
    tokens.some((token) => MADE_WORDS.has(token)) && tokens.some((token) => MISS_WORDS.has(token))
  );
}

function hasConflictingPoints(tokens) {
  const outcomeIndex = tokens.findIndex((token) => outcomeFor(token));
  if (outcomeIndex < 0) return false;
  const possiblePoints = tokens.slice(outcomeIndex + 1);
  const hasTwo = possiblePoints.some((token) => ['2', 'two', 'to', 'too'].includes(token));
  const hasThree = possiblePoints.some((token) => ['3', 'three'].includes(token));
  return hasTwo && hasThree;
}

function parseOpponentScore(tokens, trackingMode) {
  if (tokens[0] !== 'opponent') return null;
  if (trackingMode === 'dual_team') return failure('opponent_score_unavailable');

  let shorthandTokens = tokens.slice(1);
  if (shorthandTokens[0] === 'plus') shorthandTokens = shorthandTokens.slice(1);
  if (['point', 'points'].includes(shorthandTokens.at(-1))) {
    shorthandTokens = shorthandTokens.slice(0, -1);
  }
  const shorthandPoints = parseSpokenNumber(
    shorthandTokens.map((token) => (['to', 'too'].includes(token) ? 'two' : token))
  );
  if ([1, 2, 3].includes(shorthandPoints)) {
    return success({
      kind: 'opponent_score',
      action: shorthandPoints === 1 ? 'free_throw' : 'field_goal',
      outcome: 'made',
      points: shorthandPoints,
    });
  }

  const tail = parseActionTail(tokens);
  if (!tail.ok) return tail;
  const parsedAction = tail.action;
  if (
    parsedAction.participantTokens.length !== 1 ||
    parsedAction.participantTokens[0] !== 'opponent' ||
    parsedAction.outcome !== 'made' ||
    !['field_goal', 'free_throw'].includes(parsedAction.action)
  ) {
    return failure('unsupported_action');
  }

  return success({
    kind: 'opponent_score',
    action: parsedAction.action,
    outcome: 'made',
    points: parsedAction.action === 'free_throw' ? 1 : parsedAction.points,
  });
}

function parseAction(tokens) {
  for (const { phrase, action } of SIMPLE_ACTIONS) {
    if (endsWith(tokens, phrase)) {
      return { action, participantTokens: tokens.slice(0, -phrase.length) };
    }
  }

  const lastOutcome = outcomeFor(tokens.at(-1));
  const thirdLastOutcome = outcomeFor(tokens.at(-3));
  if (endsWith(tokens, ['free', 'throw']) && thirdLastOutcome) {
    return {
      action: 'free_throw',
      outcome: thirdLastOutcome,
      participantTokens: tokens.slice(0, -3),
    };
  }
  if (tokens.length >= 3 && tokens.at(-3) === 'free' && tokens.at(-2) === 'throw' && lastOutcome) {
    return {
      action: 'free_throw',
      outcome: lastOutcome,
      participantTokens: tokens.slice(0, -3),
    };
  }

  const outcomeIndexes = tokens
    .map((token, index) => (outcomeFor(token) ? index : -1))
    .filter((index) => index >= 0);
  if (outcomeIndexes.length === 1) {
    const outcomeIndex = outcomeIndexes[0];
    const outcome = outcomeFor(tokens[outcomeIndex]);
    const after = tokens.slice(outcomeIndex + 1);
    const before = tokens.slice(0, outcomeIndex);

    const pointsAfter = pointValue(after);
    if (pointsAfter != null) {
      return {
        action: 'field_goal',
        outcome,
        points: pointsAfter,
        participantTokens: before,
      };
    }

    // "twenty three made" is jersey 23, not player "twenty" scoring a three. If everything before
    // the outcome is itself a valid spoken number, it is the participant — never a point value.
    const beforeIsWholeNumber = parseSpokenNumber(before) != null;
    const possiblePointStart = Math.max(0, outcomeIndex - 2);
    for (
      let start = beforeIsWholeNumber ? outcomeIndex : possiblePointStart;
      start < outcomeIndex;
      start += 1
    ) {
      const pointsBefore = pointValue(tokens.slice(start, outcomeIndex));
      if (pointsBefore != null && start > 0) {
        return {
          action: 'field_goal',
          outcome,
          points: pointsBefore,
          participantTokens: tokens.slice(0, start),
        };
      }
    }

    if (after.length === 0) {
      return { action: 'field_goal', outcome, points: null, participantTokens: before };
    }
  }

  return null;
}

// The strip/conflict/parse sequence both entry points run. Shared so a new action or conflict
// rule is added once, and so the two cannot disagree about which refusal a phrase earns.
function parseActionTail(tokens) {
  const fieldGoalPhrase = stripPhrase(tokens, ['field', 'goal']);
  const actionTokens = fieldGoalPhrase.tokens;

  if (hasConflictingOutcome(actionTokens)) return failure('conflicting_action');
  if (hasConflictingPoints(actionTokens)) return failure('conflicting_points');

  const action = parseAction(actionTokens);
  if (!action) {
    return failure(actionTokens.length <= 1 ? 'incomplete' : 'unsupported_action');
  }
  if (fieldGoalPhrase.found && action.action !== 'field_goal') {
    return failure('conflicting_action');
  }
  return { ok: true, action };
}

function parsePrimary(transcript, context = {}) {
  const prepared = prepareVoiceText(transcript);
  if (!prepared.ok) return prepared;
  if (prepared.text === 'undo') return success({ kind: 'control', action: 'undo' });
  if (prepared.tokens.includes('undo')) return failure('unsupported_action');

  const opponentScore = parseOpponentScore(prepared.tokens, context.trackingMode);
  if (opponentScore) return opponentScore;

  const sideResult = splitSide(prepared.tokens, context.trackingMode);
  if (!sideResult.ok) return sideResult;

  const tail = parseActionTail(sideResult.tokens);
  if (!tail.ok) return tail;
  const parsedAction = tail.action;
  if (parsedAction.participantTokens.length === 0) return failure('missing_participant');
  if (parsedAction.participantTokens.some((token) => RESERVED_ACTION_WORDS.has(token))) {
    return failure('conflicting_action');
  }

  // A jersey followed by words the grammar does not know must not become a player NAME: the
  // resolver would then blame the player ("no player matched") for an unsupported phrase.
  const participantTokens = parsedAction.participantTokens;
  const numberTokens = ['number', 'jersey'].includes(participantTokens[0])
    ? participantTokens.slice(1)
    : participantTokens;
  if (
    numberTokens.length > 1 &&
    parseSpokenNumber([numberTokens[0]]) != null &&
    parseSpokenNumber(numberTokens) == null
  ) {
    return failure('unrecognised_words');
  }

  const participant = parseParticipant(participantTokens);
  if (!participant) return failure('missing_participant');

  const action = { ...parsedAction };
  delete action.participantTokens;
  return success({
    kind: 'primary',
    side: sideResult.side,
    participant,
    ...action,
  });
}

function parseFollowUp(transcript, promptContext = {}) {
  const prepared = prepareVoiceText(transcript);
  if (!prepared.ok) return prepared;
  if (prepared.text === 'skip') return success({ kind: 'control', action: 'skip' });
  if (prepared.text === 'undo') return success({ kind: 'control', action: 'undo' });
  if (prepared.text === 'unassisted') {
    return promptContext.kind === 'assist'
      ? success({ kind: 'answer', answer: 'unassisted', side: null, participant: null })
      : failure('unsupported_answer');
  }
  if (prepared.text === 'opponent') {
    return promptContext.kind === 'rebound' && promptContext.trackingMode !== 'dual_team'
      ? success({ kind: 'answer', answer: 'opponent', side: null, participant: null })
      : failure('unsupported_answer');
  }
  if (prepared.tokens.some((token) => RESERVED_ACTION_WORDS.has(token))) {
    return failure('unsupported_answer');
  }

  const first = prepared.tokens[0];
  const side = ['home', 'away'].includes(first) ? first : null;
  const participantTokens = side ? prepared.tokens.slice(1) : prepared.tokens;
  const participant = parseParticipant(participantTokens);
  if (!participant) return failure('unsupported_answer');

  return success({ kind: 'answer', answer: null, side, participant });
}

export const basketballVoiceAdapter = Object.freeze({
  parsePrimary,
  parseFollowUp,
});
