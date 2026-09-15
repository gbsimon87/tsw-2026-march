// A user-selected, timestamped play from a completed game. The YouTube embed
// identifies the moment; the operator supplies the matching local source file
// for export because an embedded player cannot be drawn into an origin-clean
// canvas. No server upload or automatic publishing occurs.

export const RECEIPT_SECONDS = Object.freeze({ hook: 1, play: 7, end: 2, total: 10 });

const STAT_DESCRIPTIONS = Object.freeze({
  FG2_MADE: '2-point make',
  FG3_MADE: '3-point make',
  FT_MADE: 'Free throw',
  AST: 'Assist',
  STL: 'Steal',
  BLK: 'Block',
});

function playerId(value) {
  return String(value?.leaguePlayerId || value?.playerId || '');
}

function boxScorePlayers(data) {
  return [
    ...(data?.boxScore?.players || []),
    ...(data?.boxScore?.home?.players || []),
    ...(data?.boxScore?.away?.players || []),
  ];
}

export function eligibleReceiptHighlights(data, marketing) {
  if (data?.game?.status !== 'completed' || !marketing?.canFeature) return [];
  const restricted = new Set((marketing.restrictedPlayerIds || []).map(String));
  const rows = boxScorePlayers(data);
  return (data.highlights || []).filter((highlight) => {
    const id = playerId(highlight);
    return (
      id &&
      !restricted.has(id) &&
      Number.isFinite(highlight.videoTimestamp) &&
      highlight.videoTimestamp >= 0 &&
      STAT_DESCRIPTIONS[highlight.statType] &&
      rows.some((row) => playerId(row) === id)
    );
  });
}

function scoreLine(data) {
  const home = data?.recap?.team;
  const away = data?.recap?.opponent;
  if (
    !home?.name ||
    !away?.name ||
    !Number.isFinite(home.points) ||
    !Number.isFinite(away.points)
  ) {
    return null;
  }
  return `${home.name} ${home.points}–${away.points} ${away.name}`;
}

export function buildHighlightReceiptPlan({
  data,
  marketing,
  highlight,
  sourceDuration,
  sourceCredit,
  momentSeconds = highlight?.videoTimestamp,
}) {
  if (
    !highlight ||
    !eligibleReceiptHighlights(data, marketing).some((row) => row.eventId === highlight.eventId)
  ) {
    return { error: 'Choose a cleared, timestamped play from a completed game.' };
  }
  if (!Number.isFinite(sourceDuration) || sourceDuration < RECEIPT_SECONDS.play) {
    return { error: 'Choose a local source video at least seven seconds long.' };
  }
  if (!Number.isFinite(momentSeconds) || momentSeconds < 0 || momentSeconds > sourceDuration) {
    return { error: 'The selected moment is outside the source video.' };
  }
  const credit = String(sourceCredit || '').trim();
  if (!credit) return { error: 'Enter a source-video credit.' };
  if (data?.game?.trackingMode !== 'dual_team' && !data?.gameSummary?.hasOpponentScore) {
    return { error: 'An opponent score was not tracked, so a final result cannot be shown.' };
  }
  const result = scoreLine(data);
  if (!result) return { error: 'A final score is required for the receipt.' };

  const id = playerId(highlight);
  const row = boxScorePlayers(data).find((candidate) => playerId(candidate) === id);
  const name = row.displayName || highlight.playerName;
  if (!name) return { error: 'A recorded player name is required for the receipt.' };

  const startSeconds = Math.min(
    Math.max(0, momentSeconds - RECEIPT_SECONDS.play / 2),
    sourceDuration - RECEIPT_SECONDS.play
  );
  return {
    error: null,
    eventId: highlight.eventId,
    startSeconds,
    durationSeconds: RECEIPT_SECONDS.total,
    playSeconds: RECEIPT_SECONDS.play,
    playerName: name,
    playLabel: STAT_DESCRIPTIONS[highlight.statType],
    statLine: `${row.points || 0} PTS · ${row.reb || 0} REB · ${row.ast || 0} AST`,
    result,
    sourceCredit: credit,
    gameUrl: `/games/${data.game.id}`,
  };
}

export function receiptRecordingType(MediaRecorderClass = globalThis.MediaRecorder) {
  if (!MediaRecorderClass?.isTypeSupported) return null;
  for (const mimeType of [
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]) {
    if (MediaRecorderClass.isTypeSupported(mimeType)) {
      return { mimeType, extension: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm' };
    }
  }
  return null;
}
