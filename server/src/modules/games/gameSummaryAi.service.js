const { env } = require('../../config/env');
const { logger } = require('../../config/logger');

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_SUMMARY_LENGTH = 900;

function getParticipantNames(game, recap) {
  if (recap?.home && recap?.away) {
    return {
      homeName: recap.home.name || game.homeParticipant?.displayName || 'Home',
      awayName: recap.away.name || game.awayParticipant?.displayName || 'Away',
    };
  }

  return {
    homeName: recap?.team?.name || game.homeParticipant?.displayName || 'Team',
    awayName:
      recap?.opponent?.name || game.awayParticipant?.displayName || game.opponent || 'Opponent',
  };
}

function formatRecordName(name) {
  return name || 'Unknown';
}

function getScoreLine(game, recap) {
  const { homeName, awayName } = getParticipantNames(game, recap);
  const homePoints = recap?.home?.points ?? recap?.team?.points ?? 0;
  const awayPoints = recap?.away?.points ?? recap?.opponent?.points ?? 0;

  return {
    homeName,
    awayName,
    homePoints,
    awayPoints,
    winnerName:
      homePoints === awayPoints
        ? null
        : homePoints > awayPoints
          ? formatRecordName(homeName)
          : formatRecordName(awayName),
  };
}

function formatFinalScore(score) {
  if (!score.winnerName) {
    return `${score.homePoints}-${score.awayPoints}`;
  }

  const winnerPoints = score.winnerName === score.homeName ? score.homePoints : score.awayPoints;
  const loserPoints = score.winnerName === score.homeName ? score.awayPoints : score.homePoints;
  return `${winnerPoints}-${loserPoints}`;
}

function formatTopPerformer(player) {
  const stats = [`${player.points || 0} points`];
  if (player.reb) stats.push(`${player.reb} rebounds`);
  if (player.ast) stats.push(`${player.ast} assists`);
  const teamSuffix = player.teamName ? ` for ${player.teamName}` : '';
  return `${player.displayName}${teamSuffix} had ${stats.join(', ')}`;
}

function buildFallbackSummary(game, recap) {
  const score = getScoreLine(game, recap);
  const loserName =
    score.winnerName === score.homeName
      ? score.awayName
      : score.winnerName === score.awayName
        ? score.homeName
        : null;
  const scoreSentence = score.winnerName
    ? `${score.winnerName} beat ${loserName}, ${formatFinalScore(score)}.`
    : `${score.homeName} and ${score.awayName} finished level at ${score.homePoints}-${score.awayPoints}.`;

  const performers = (recap?.topPerformers || [])
    .slice(0, 2)
    .filter((player) => player.displayName);
  if (performers.length === 0) {
    return scoreSentence;
  }

  return `${scoreSentence} ${performers.map(formatTopPerformer).join(', while ')}.`;
}

function buildPromptPayload(game, recap, boxScore) {
  const score = getScoreLine(game, recap);
  const keyMoments = (recap?.keyMoments || []).slice(0, 8).map((moment) => ({
    playerName: moment.playerName,
    statLabel: moment.statLabel,
    statType: moment.statType,
    occurredAt: moment.occurredAt,
  }));

  return {
    title: game.title,
    status: game.status,
    score,
    topPerformers: (recap?.topPerformers || []).slice(0, 6),
    teamStats: {
      home:
        recap?.homeStats ||
        recap?.teamStats ||
        boxScore?.home?.totals ||
        boxScore?.teamTotals ||
        null,
      away: recap?.awayStats || boxScore?.away?.totals || boxScore?.opponentTotals || null,
    },
    keyMoments,
  };
}

function normalizeSummaryText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_SUMMARY_LENGTH);
}

function extractResponseText(data) {
  if (typeof data?.output_text === 'string') {
    return data.output_text;
  }

  const firstText = data?.output
    ?.flatMap((item) => item.content || [])
    ?.find((content) => typeof content.text === 'string')?.text;

  return firstText || '';
}

async function requestOpenAiSummary(input) {
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(env.OPENAI_GAME_SUMMARY_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENAI_GAME_SUMMARY_MODEL,
      max_output_tokens: 220,
      input: [
        {
          role: 'system',
          content:
            'You write concise basketball recaps in the tone of a professional sports beat writer. Use only the supplied facts. Do not invent injuries, quotes, standings, streaks, or context.',
        },
        {
          role: 'user',
          content: `Write one polished 60-100 word paragraph recapping this league game. Mention the final score, top players, and notable events when available.\n\n${JSON.stringify(input)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`OpenAI summary request failed with ${response.status}: ${message}`);
  }

  const data = await response.json();
  return normalizeSummaryText(extractResponseText(data));
}

async function buildPersistedGameSummary(game, { recap, boxScore }) {
  if (game.gameContext !== 'league') {
    return null;
  }

  if (game.aiSummary?.text) {
    return game.aiSummary;
  }

  const fallbackText = buildFallbackSummary(game, recap);

  try {
    const promptPayload = buildPromptPayload(game, recap, boxScore);
    const text = await requestOpenAiSummary(promptPayload);
    if (text) {
      return {
        text,
        source: 'ai',
        provider: 'openai',
        model: env.OPENAI_GAME_SUMMARY_MODEL,
        generatedAt: new Date(),
      };
    }
  } catch (error) {
    logger.warn({ err: error, gameId: String(game._id) }, 'AI game summary generation failed');
  }

  return {
    text: fallbackText,
    source: 'fallback',
    provider: null,
    model: null,
    generatedAt: new Date(),
  };
}

module.exports = {
  buildFallbackSummary,
  buildPersistedGameSummary,
  buildPromptPayload,
};
