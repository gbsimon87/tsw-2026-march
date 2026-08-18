import { extractYouTubeVideoId } from './youtube';

const DEFAULT_MAX_HIGHLIGHTS = 5;
const DEFAULT_CLIP_BUFFER_SECONDS = 5;
const DEFAULT_DEDUPE_WINDOW_SECONDS = 3;

// Keep the same headline priority already used by the game recap: made threes,
// then made twos, then the remaining eligible moments in their source order.
const HIGHLIGHT_PRIORITY = {
  FG3_MADE: 0,
  FG2_MADE: 1,
};

function isPlayableHighlight(highlight) {
  return Boolean(
    highlight &&
    Number.isFinite(highlight.videoTimestamp) &&
    extractYouTubeVideoId(highlight.videoUrl)
  );
}

export function selectFeaturedHighlights(highlights, maxHighlights = DEFAULT_MAX_HIGHLIGHTS) {
  return (highlights || [])
    .map((highlight, sourceIndex) => ({ highlight, sourceIndex }))
    .filter(({ highlight }) => isPlayableHighlight(highlight))
    .sort((a, b) => {
      const priorityDifference =
        (HIGHLIGHT_PRIORITY[a.highlight.statType] ?? 2) -
        (HIGHLIGHT_PRIORITY[b.highlight.statType] ?? 2);
      return priorityDifference || a.sourceIndex - b.sourceIndex;
    })
    .slice(0, Math.max(0, maxHighlights))
    .map(({ highlight }) => highlight);
}

export function buildHighlightReelSegments(
  highlights,
  {
    maxHighlights = DEFAULT_MAX_HIGHLIGHTS,
    clipBufferSeconds = DEFAULT_CLIP_BUFFER_SECONDS,
    dedupeWindowSeconds = DEFAULT_DEDUPE_WINDOW_SECONDS,
  } = {}
) {
  const selected = [];

  for (const highlight of selectFeaturedHighlights(highlights, highlights?.length || 0)) {
    const overlapsSelectedMoment = selected.some(
      (existing) =>
        existing.videoUrl === highlight.videoUrl &&
        Math.abs(existing.videoTimestamp - highlight.videoTimestamp) <= dedupeWindowSeconds
    );

    if (!overlapsSelectedMoment) {
      selected.push(highlight);
    }
    if (selected.length >= maxHighlights) {
      break;
    }
  }

  return selected
    .map((highlight) => ({
      ...highlight,
      videoId: extractYouTubeVideoId(highlight.videoUrl),
      startSeconds: Math.max(0, highlight.videoTimestamp - clipBufferSeconds),
      endSeconds: highlight.videoTimestamp + clipBufferSeconds,
    }))
    .sort((a, b) => a.videoTimestamp - b.videoTimestamp);
}

export { DEFAULT_CLIP_BUFFER_SECONDS, DEFAULT_DEDUPE_WINDOW_SECONDS, DEFAULT_MAX_HIGHLIGHTS };
