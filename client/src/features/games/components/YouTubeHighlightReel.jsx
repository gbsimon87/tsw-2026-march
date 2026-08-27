import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gameConstants from '../constants';
import { buildHighlightReelSegments } from '../highlightReel';

const { STAT_LABELS } = gameConstants;

function buildEmbedUrl(segment) {
  if (!segment?.videoId) return null;

  const params = new URLSearchParams({
    enablejsapi: '1',
    autoplay: '1',
    controls: '0',
    disablekb: '1',
    fs: '0',
    iv_load_policy: '3',
    rel: '0',
    playsinline: '1',
    start: String(segment.startSeconds),
    end: String(segment.endSeconds),
  });

  if (typeof window !== 'undefined' && window.location.origin) {
    params.set('origin', window.location.origin);
  }

  return `https://www.youtube.com/embed/${segment.videoId}?${params.toString()}`;
}

export function YouTubeHighlightReel({ highlights, title = 'Game highlights' }) {
  const segments = useMemo(() => buildHighlightReelSegments(highlights), [highlights]);
  const segmentsKey = segments.map((segment) => segment.eventId).join(':');
  const [activeIndex, setActiveIndex] = useState(0);
  const [playbackCycle, setPlaybackCycle] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef(null);
  const videoContainerRef = useRef(null);
  const handledEndRef = useRef(false);

  useEffect(() => {
    setActiveIndex(0);
    setPlaybackCycle(0);
    setIsComplete(false);
  }, [segmentsKey]);

  const goToHighlight = useCallback(
    (nextIndex) => {
      if (segments.length === 0) return;
      const boundedIndex = Math.min(Math.max(nextIndex, 0), segments.length - 1);
      handledEndRef.current = false;
      setIsComplete(false);
      setActiveIndex(boundedIndex);
      setPlaybackCycle((cycle) => cycle + 1);
    },
    [segments.length]
  );

  useEffect(() => {
    function onMessage(event) {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
        return;
      }

      try {
        const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (payload?.event !== 'onStateChange' || payload.info !== 0 || handledEndRef.current) {
          return;
        }

        handledEndRef.current = true;
        setActiveIndex((currentIndex) => {
          if (currentIndex < segments.length - 1) {
            setPlaybackCycle((cycle) => cycle + 1);
            return currentIndex + 1;
          }
          setIsComplete(true);
          return currentIndex;
        });
      } catch {
        // YouTube also emits non-JSON postMessage traffic; it is unrelated to player state.
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [segments.length]);

  useEffect(() => {
    function onFullscreenChange() {
      const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
      setIsFullscreen(fullscreenElement === videoContainerRef.current);
    }

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);

  function sendPlayerCommand(func, args = []) {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      '*'
    );
  }

  function subscribeToPlayerEvents(event) {
    const playerWindow = event.currentTarget.contentWindow;
    if (!playerWindow) return;
    handledEndRef.current = false;
    playerWindow.postMessage('{"event":"listening","id":"tsw-highlight-reel"}', '*');
    playerWindow.postMessage(
      '{"event":"command","func":"addEventListener","args":["onStateChange"]}',
      '*'
    );
    playerWindow.postMessage(
      JSON.stringify({ event: 'command', func: 'setVolume', args: [volume] }),
      '*'
    );
    playerWindow.postMessage(
      JSON.stringify({ event: 'command', func: isMuted ? 'mute' : 'unMute', args: [] }),
      '*'
    );
  }

  function changeVolume(event) {
    const nextVolume = Number(event.target.value);
    setVolume(nextVolume);
    setIsMuted(nextVolume === 0);
    sendPlayerCommand('setVolume', [nextVolume]);
    sendPlayerCommand(nextVolume === 0 ? 'mute' : 'unMute');
  }

  function toggleMute() {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    sendPlayerCommand(nextMuted ? 'mute' : 'unMute');
  }

  async function toggleFullscreen() {
    const container = videoContainerRef.current;
    if (!container) return;

    const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
    if (fullscreenElement) {
      const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
      await exitFullscreen?.call(document);
      return;
    }

    const requestFullscreen = container.requestFullscreen || container.webkitRequestFullscreen;
    await requestFullscreen?.call(container);
  }

  if (segments.length === 0) {
    return (
      <div className="rounded-xl bg-slate-100 p-6 text-center text-sm text-slate-600">
        No playable YouTube highlights are available for this game.
      </div>
    );
  }

  const activeSegment = segments[activeIndex];
  const statLabel = STAT_LABELS[activeSegment.statType] || activeSegment.statType;

  return (
    <div className="overflow-hidden rounded-2xl bg-slate-950 text-white">
      <div
        ref={videoContainerRef}
        data-testid="highlight-reel-player"
        className={`relative w-full overflow-hidden bg-black ${
          isFullscreen ? 'h-screen' : 'aspect-[4/3] sm:aspect-video'
        }`}
      >
        <iframe
          key={`${activeSegment.eventId}:${playbackCycle}`}
          ref={iframeRef}
          className={`absolute left-1/2 top-1/2 h-full max-w-none -translate-x-1/2 -translate-y-1/2 ${
            isFullscreen ? 'w-full' : 'w-[133.333%] sm:w-full'
          }`}
          src={buildEmbedUrl(activeSegment)}
          title={`${title} — highlight ${activeIndex + 1}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={subscribeToPlayerEvents}
        />

        <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-xl bg-slate-950/85 px-2.5 py-2 shadow-lg backdrop-blur-sm">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? 'Unmute highlight reel' : 'Mute highlight reel'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {isMuted ? (
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor">
                <path d="M3 8h3l4-3v10l-4-3H3V8Z" strokeWidth="1.7" />
                <path d="m13 8 4 4m0-4-4 4" strokeWidth="1.7" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor">
                <path d="M3 8h3l4-3v10l-4-3H3V8Z" strokeWidth="1.7" />
                <path d="M13 7.5a4 4 0 0 1 0 5" strokeWidth="1.7" />
              </svg>
            )}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={isMuted ? 0 : volume}
            onChange={changeVolume}
            aria-label="Highlight reel volume"
            className="h-1.5 w-20 cursor-pointer accent-amber-400 sm:w-24"
          />
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Minimise highlight reel' : 'Maximise highlight reel'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor">
              {isFullscreen ? (
                <path d="M8 3v5H3m9 9v-5h5M3 8l5-5m4 14 5-5" strokeWidth="1.7" />
              ) : (
                <path d="M3 8V3h5m9 9v5h-5M8 3 3 8m14 4-5 5" strokeWidth="1.7" />
              )}
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">
              {statLabel}
            </p>
            <p className="mt-1 truncate text-base font-semibold">
              {activeSegment.playerName || 'Game highlight'}
            </p>
          </div>
          <p className="shrink-0 text-sm tabular-nums text-slate-300" aria-live="polite">
            Highlight {activeIndex + 1} of {segments.length}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => goToHighlight(activeIndex - 1)}
            disabled={activeIndex === 0}
            className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>

          <div className="flex items-center gap-1.5" aria-label="Highlight reel progress">
            {segments.map((segment, index) => (
              <button
                key={segment.eventId}
                type="button"
                aria-label={`Play highlight ${index + 1}`}
                aria-current={index === activeIndex ? 'true' : undefined}
                onClick={() => goToHighlight(index)}
                className={`h-2.5 rounded-full transition ${
                  index === activeIndex ? 'w-7 bg-[#F4A300]' : 'w-2.5 bg-white/30 hover:bg-white/60'
                }`}
              />
            ))}
          </div>

          {isComplete ? (
            <button
              type="button"
              onClick={() => goToHighlight(0)}
              className="rounded-lg bg-[#F4A300] px-3 py-2 text-sm font-semibold text-[#141414] transition-colors hover:bg-[#ffb524]"
            >
              Replay
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goToHighlight(activeIndex + 1)}
              disabled={activeIndex === segments.length - 1}
              className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          )}
        </div>

        <p className="text-xs leading-5 text-slate-400">
          These moments play directly from the game&apos;s YouTube video. TSW does not copy or
          re-host the footage.
        </p>
      </div>
    </div>
  );
}

export { buildEmbedUrl };
