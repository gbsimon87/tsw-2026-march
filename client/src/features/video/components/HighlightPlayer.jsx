import { forwardRef, useEffect, useRef } from 'react';
import { extractYouTubeVideoId } from '../../games/youtube';
import { isMuxHighlight } from '../videoSource';
import { activatePlayback, releasePlayback } from '../playbackCoordinator';
import { MuxVideo } from './MuxVideo';
export const HighlightPlayer = forwardRef(function HighlightPlayer(
  {
    highlight,
    title = 'Game highlight',
    className = '',
    autoPlay = false,
    muted = false,
    onEnded,
    onUnavailable,
    ...props
  },
  ref
) {
  const iframe = useRef(null);
  const mux = isMuxHighlight(highlight);
  const videoId = extractYouTubeVideoId(highlight?.videoUrl);
  const command = (func) =>
    iframe.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args: [] }),
      'https://www.youtube.com'
    );
  useEffect(() => {
    const el = iframe.current;
    const listener = (e) => {
      if (!el || e.source !== el.contentWindow) return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        const state = data?.event === 'onStateChange' ? data.info : data?.info?.playerState;
        if (state === 1) activatePlayback(el, () => command('pauseVideo'));
        if (state === 0) onEnded?.();
      } catch {
        /* unrelated iframe message */
      }
    };
    window.addEventListener('message', listener);
    return () => {
      window.removeEventListener('message', listener);
      releasePlayback(el);
    };
  }, [videoId, onEnded]);
  if (
    highlight?.videoAvailable === false ||
    !Number.isFinite(highlight?.videoTimestamp) ||
    highlight.videoTimestamp < 0 ||
    (!mux && !videoId)
  )
    return (
      <p className="p-6 text-sm text-slate-400" role="status">
        Video unavailable
      </p>
    );
  if (mux)
    return (
      <MuxVideo
        {...props}
        ref={ref}
        gameId={highlight.gameId}
        eventId={highlight.eventId}
        version={`${highlight.videoVersion ?? ''}:${highlight.videoTimestamp}`}
        title={title}
        className={className}
        autoPlay={autoPlay}
        muted={muted}
        onEnded={onEnded}
        onUnavailable={onUnavailable}
      />
    );
  const params = new URLSearchParams({
    start: String(Math.max(0, highlight.videoTimestamp - 5)),
    end: String(highlight.videoTimestamp + 5),
    autoplay: autoPlay ? '1' : '0',
    mute: muted ? '1' : '0',
    controls: '1',
    rel: '0',
    playsinline: '1',
    enablejsapi: '1',
    origin: window.location.origin,
  });
  return (
    <iframe
      ref={(el) => {
        iframe.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      src={`https://www.youtube.com/embed/${videoId}?${params}`}
      title={title}
      className={className || 'aspect-video w-full'}
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      onLoad={() => {
        const el = iframe.current;
        el?.contentWindow?.postMessage('{"event":"listening","id":1}', 'https://www.youtube.com');
        el?.contentWindow?.postMessage(
          '{"event":"command","func":"addEventListener","args":["onStateChange"]}',
          'https://www.youtube.com'
        );
        if (autoPlay) activatePlayback(el, () => command('pauseVideo'));
      }}
    />
  );
});
