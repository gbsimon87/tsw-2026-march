const {
  GAME_VIDEO_STATUSES,
  HIGHLIGHT_CLIP_BUFFER_SECONDS,
  createGameVideoGenerationId,
  nextGameVideoVersion,
  getGameVideoProvider,
  hasGameVideo,
  sanitizeGameVideo,
  buildClipWindow,
  getCurrentVideoTimelineId,
  getCurrentTimelineIds,
  resolveEventTimelineId,
  isEventOnCurrentTimeline,
  buildHighlightVideoFields,
} = require('../../modules/shared/gameVideo');
const { extractYouTubeVideoId } = require('../../modules/shared/youtube');

const YOUTUBE_ID = 'dQw4w9WgXcQ';
const YOUTUBE = `https://www.youtube.com/watch?v=${YOUTUBE_ID}`;
const OTHER_YOUTUBE_ID = 'aBcDeFgHiJk';
const OTHER_YOUTUBE = `https://youtu.be/${OTHER_YOUTUBE_ID}`;
const GEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const readyMux = {
  provider: 'mux',
  status: 'ready',
  generationId: GEN,
  version: 3,
  playbackId: 'pb-1',
  durationSeconds: 5400,
  equivalentTimelines: [],
};

describe('constants', () => {
  test('statuses and clip buffer', () => {
    expect(GAME_VIDEO_STATUSES).toEqual(['uploading', 'processing', 'ready', 'errored']);
    expect(HIGHLIGHT_CLIP_BUFFER_SECONDS).toBe(5);
  });
});

describe('extractYouTubeVideoId (mirrors client/src/features/games/youtube.js)', () => {
  test('watch, short, embed and shorts links', () => {
    expect(extractYouTubeVideoId(YOUTUBE)).toBe(YOUTUBE_ID);
    expect(extractYouTubeVideoId(OTHER_YOUTUBE)).toBe(OTHER_YOUTUBE_ID);
    expect(extractYouTubeVideoId(`https://www.youtube.com/embed/${YOUTUBE_ID}`)).toBe(YOUTUBE_ID);
    expect(extractYouTubeVideoId(`https://m.youtube.com/shorts/${YOUTUBE_ID}`)).toBe(YOUTUBE_ID);
  });
  test('rejects malformed ids and non-YouTube hosts', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(extractYouTubeVideoId(`https://vimeo.com/${YOUTUBE_ID}`)).toBeNull();
    expect(extractYouTubeVideoId('not a url')).toBeNull();
    expect(extractYouTubeVideoId(null)).toBeNull();
  });
});

describe('createGameVideoGenerationId / nextGameVideoVersion', () => {
  test('generation ids are random 32-hex strings', () => {
    const a = createGameVideoGenerationId();
    const b = createGameVideoGenerationId();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
  test('a new generation version never repeats an earlier one, even after removal', () => {
    expect(nextGameVideoVersion(null, 1_000)).toBe(1_000);
    expect(nextGameVideoVersion(undefined, 1_000)).toBe(1_000);
    expect(nextGameVideoVersion(999, 1_000)).toBe(1_000);
    // Clock skew or a burst of writes: still strictly greater than the previous.
    expect(nextGameVideoVersion(5_000, 1_000)).toBe(5_001);
    expect(Number.isInteger(nextGameVideoVersion(null))).toBe(true);
  });
});

describe('getGameVideoProvider', () => {
  test('a ready Mux video wins over a YouTube link', () => {
    expect(getGameVideoProvider({ videoUrl: YOUTUBE, video: readyMux })).toBe('mux');
  });
  test('falls back to YouTube while the Mux video is still processing', () => {
    const video = { ...readyMux, status: 'processing', playbackId: null };
    expect(getGameVideoProvider({ videoUrl: YOUTUBE, video })).toBe('youtube');
  });
  test('a ready Mux video with no playback id is not playable', () => {
    expect(getGameVideoProvider({ video: { ...readyMux, playbackId: null } })).toBeNull();
  });
  test('a ready Mux video needs a finite positive duration (R4)', () => {
    for (const durationSeconds of [null, undefined, 0, -1, Number.NaN, Infinity]) {
      expect(getGameVideoProvider({ video: { ...readyMux, durationSeconds } })).toBeNull();
      expect(
        getGameVideoProvider({ videoUrl: YOUTUBE, video: { ...readyMux, durationSeconds } })
      ).toBe('youtube');
    }
  });
  test('errored and uploading Mux videos are not playable', () => {
    expect(getGameVideoProvider({ video: { ...readyMux, status: 'errored' } })).toBeNull();
    expect(getGameVideoProvider({ video: { ...readyMux, status: 'uploading' } })).toBeNull();
  });
  test('no video at all', () => {
    expect(getGameVideoProvider({})).toBeNull();
    expect(getGameVideoProvider(null)).toBeNull();
    expect(hasGameVideo({})).toBe(false);
    expect(hasGameVideo({ videoUrl: YOUTUBE })).toBe(true);
    expect(hasGameVideo({ video: readyMux })).toBe(true);
  });
});

describe('sanitizeGameVideo', () => {
  // V16: anonymous/public payloads see ready media only, never internal codes.
  test('public view hides unfinished media and internal error codes', () => {
    expect(
      sanitizeGameVideo(
        { provider: 'mux', status: 'errored', errorMessage: 'provider_create_failed', version: 2 },
        { publicView: true }
      )
    ).toBeNull();
    expect(
      sanitizeGameVideo({ ...readyMux, status: 'processing' }, { publicView: true })
    ).toBeNull();
    expect(
      sanitizeGameVideo({ ...readyMux, errorMessage: 'stale' }, { publicView: true })
    ).toMatchObject({ status: 'ready', errorMessage: null });
  });

  test('exposes status and the non-secret version, never Mux ids', () => {
    expect(
      sanitizeGameVideo({
        ...readyMux,
        uploadId: 'up-1',
        assetId: 'as-1',
        errorMessage: null,
        equivalentTimelines: [`youtube:${YOUTUBE_ID}`],
      })
    ).toEqual({
      provider: 'mux',
      status: 'ready',
      durationSeconds: 5400,
      errorMessage: null,
      version: 3,
    });
  });
  test('missing optional fields serialise as null', () => {
    expect(sanitizeGameVideo({ provider: 'mux', status: 'uploading' })).toEqual({
      provider: 'mux',
      status: 'uploading',
      durationSeconds: null,
      errorMessage: null,
      version: null,
    });
  });
  test('hidden without premium media', () => {
    expect(sanitizeGameVideo(readyMux, { includePremiumMedia: false })).toBeNull();
    expect(sanitizeGameVideo(null)).toBeNull();
  });
});

describe('buildClipWindow', () => {
  test('pads five seconds either side', () => {
    expect(buildClipWindow(100, 5400)).toEqual({ startSeconds: 95, endSeconds: 105 });
  });
  test('clamps at both ends of the video', () => {
    expect(buildClipWindow(2, 5400)).toEqual({ startSeconds: 0, endSeconds: 7 });
    expect(buildClipWindow(5398, 5400)).toEqual({ startSeconds: 5393, endSeconds: 5400 });
  });
  test('rejects a timestamp outside the video', () => {
    expect(buildClipWindow(6000, 5400)).toBeNull();
    expect(buildClipWindow(-1, 5400)).toBeNull();
    expect(buildClipWindow(Number.NaN, 5400)).toBeNull();
  });
  test('without a known duration, only clamps the start', () => {
    expect(buildClipWindow(100, null)).toEqual({ startSeconds: 95, endSeconds: 105 });
  });
});

describe('getCurrentVideoTimelineId (P6)', () => {
  test('a playable Mux video is the mux:<generationId> timeline, even with a YouTube link', () => {
    expect(getCurrentVideoTimelineId({ videoUrl: YOUTUBE, video: readyMux })).toBe(`mux:${GEN}`);
  });
  test('YouTube is the youtube:<videoId> timeline while Mux is not playable', () => {
    const video = { ...readyMux, status: 'processing', playbackId: null };
    expect(getCurrentVideoTimelineId({ videoUrl: YOUTUBE, video })).toBe(`youtube:${YOUTUBE_ID}`);
    expect(getCurrentVideoTimelineId({ videoUrl: OTHER_YOUTUBE })).toBe(
      `youtube:${OTHER_YOUTUBE_ID}`
    );
  });
  test('no timeline without a playable video or with an unparseable YouTube link', () => {
    expect(getCurrentVideoTimelineId({})).toBeNull();
    expect(getCurrentVideoTimelineId(null)).toBeNull();
    expect(getCurrentVideoTimelineId({ videoUrl: 'https://www.youtube.com/watch?v=bad' })).toBe(
      null
    );
  });
  test('the timeline set includes equivalent timelines only for the playable Mux video', () => {
    const video = { ...readyMux, equivalentTimelines: [`youtube:${YOUTUBE_ID}`] };
    expect(getCurrentTimelineIds({ videoUrl: YOUTUBE, video })).toEqual([
      `mux:${GEN}`,
      `youtube:${YOUTUBE_ID}`,
    ]);
    // Not ready yet: the equivalences belong to a video nobody can watch.
    const processing = {
      ...video,
      status: 'processing',
      equivalentTimelines: [`youtube:${OTHER_YOUTUBE_ID}`],
    };
    expect(getCurrentTimelineIds({ videoUrl: YOUTUBE, video: processing })).toEqual([
      `youtube:${YOUTUBE_ID}`,
    ]);
    expect(getCurrentTimelineIds({})).toEqual([]);
  });
});

describe('resolveEventTimelineId (P6)', () => {
  test('a stamped event keeps its own timeline', () => {
    const event = { videoTimestamp: 30, videoTimelineId: `mux:${GEN}` };
    expect(resolveEventTimelineId({ videoUrl: YOUTUBE }, event)).toBe(`mux:${GEN}`);
  });
  test('a legacy event falls back to the current YouTube link', () => {
    const event = { videoTimestamp: 30 };
    expect(resolveEventTimelineId({ videoUrl: YOUTUBE, video: readyMux }, event)).toBe(
      `youtube:${YOUTUBE_ID}`
    );
    expect(resolveEventTimelineId({ video: readyMux }, event)).toBeNull();
  });
  test('an event without a video timestamp has no timeline', () => {
    expect(resolveEventTimelineId({ videoUrl: YOUTUBE }, {})).toBeNull();
    expect(resolveEventTimelineId({ videoUrl: YOUTUBE }, null)).toBeNull();
  });
});

describe('isEventOnCurrentTimeline (P6)', () => {
  test('legacy YouTube timestamps stay on YouTube while it is the current video', () => {
    expect(isEventOnCurrentTimeline({ videoUrl: YOUTUBE }, { videoTimestamp: 30 })).toBe(true);
  });
  test('YouTube to Mux replacement strands old timestamps unless declared equivalent', () => {
    const legacy = { videoTimestamp: 30 };
    const stamped = { videoTimestamp: 30, videoTimelineId: `youtube:${YOUTUBE_ID}` };
    const game = { videoUrl: YOUTUBE, video: readyMux };
    expect(isEventOnCurrentTimeline(game, legacy)).toBe(false);
    expect(isEventOnCurrentTimeline(game, stamped)).toBe(false);

    const sameRecording = {
      videoUrl: YOUTUBE,
      video: { ...readyMux, equivalentTimelines: [`youtube:${YOUTUBE_ID}`] },
    };
    expect(isEventOnCurrentTimeline(sameRecording, legacy)).toBe(true);
    expect(isEventOnCurrentTimeline(sameRecording, stamped)).toBe(true);
  });
  test('a different YouTube link does not adopt old timestamps', () => {
    const stamped = { videoTimestamp: 30, videoTimelineId: `youtube:${YOUTUBE_ID}` };
    expect(isEventOnCurrentTimeline({ videoUrl: OTHER_YOUTUBE }, stamped)).toBe(false);
  });
  test('Mux removal does not move Mux timestamps onto a YouTube link', () => {
    const stamped = { videoTimestamp: 30, videoTimelineId: `mux:${GEN}` };
    expect(isEventOnCurrentTimeline({ videoUrl: YOUTUBE, video: null }, stamped)).toBe(false);
    expect(isEventOnCurrentTimeline({ videoUrl: YOUTUBE, video: readyMux }, stamped)).toBe(true);
  });
  test('a replaced Mux generation is unavailable on the new one', () => {
    const stamped = { videoTimestamp: 30, videoTimelineId: 'mux:oldgeneration' };
    expect(isEventOnCurrentTimeline({ video: readyMux }, stamped)).toBe(false);
  });
});

describe('buildHighlightVideoFields(game, event)', () => {
  test('Mux highlights carry no URL', () => {
    const event = { videoTimestamp: 30, videoTimelineId: `mux:${GEN}` };
    expect(buildHighlightVideoFields({ videoUrl: YOUTUBE, video: readyMux }, event)).toEqual({
      videoAvailable: true,
      videoProvider: 'mux',
      videoUrl: null,
    });
  });
  test('YouTube highlights keep the URL', () => {
    expect(buildHighlightVideoFields({ videoUrl: YOUTUBE }, { videoTimestamp: 30 })).toEqual({
      videoAvailable: true,
      videoProvider: 'youtube',
      videoUrl: YOUTUBE,
    });
  });
  test('an event equivalent to the current Mux timeline plays on Mux', () => {
    const game = {
      videoUrl: YOUTUBE,
      video: { ...readyMux, equivalentTimelines: [`youtube:${YOUTUBE_ID}`] },
    };
    expect(buildHighlightVideoFields(game, { videoTimestamp: 30 })).toEqual({
      videoAvailable: true,
      videoProvider: 'mux',
      videoUrl: null,
    });
  });
  test('an event on another timeline is unavailable', () => {
    const unavailable = { videoAvailable: false, videoProvider: null, videoUrl: null };
    expect(
      buildHighlightVideoFields({ videoUrl: YOUTUBE, video: readyMux }, { videoTimestamp: 30 })
    ).toEqual(unavailable);
    expect(buildHighlightVideoFields({}, { videoTimestamp: 30 })).toEqual(unavailable);
    expect(buildHighlightVideoFields({ videoUrl: YOUTUBE }, {})).toEqual(unavailable);
  });
});
