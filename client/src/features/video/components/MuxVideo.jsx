import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import MuxPlayer from '@mux/mux-player-react/lazy';
import { playbackExpiresAt, useVideoPlayback } from '../hooks/useVideoPlayback';
import { activatePlayback, releasePlayback } from '../playbackCoordinator';

const MuxVideoSession = forwardRef(function MuxVideoSession(
  {
    gameId,
    eventId = null,
    version = null,
    title = 'Game video',
    className = '',
    active,
    autoPlay = false,
    muted = false,
    loop = false,
    fill = false,
    onPlay,
    onPause,
    onEnded,
    onTimeUpdate,
    onUnavailable,
    onReady,
    volume = 1,
  },
  ref
) {
  const player = useRef(null);
  const saved = useRef(null);
  const retried = useRef(false);
  const [mediaError, setMediaError] = useState(false);
  const [intent, setIntent] = useState(autoPlay);
  // V2: the viewer's last play/pause, so a token renewal (which reloads the
  // source and clears `saved`) never re-arms autoplay on a paused video.
  const [playing, setPlaying] = useState(null);
  const enabled = active === undefined ? intent : active;
  const snapshot = useCallback(() => {
    const el = player.current;
    if (el && el.readyState > 0)
      saved.current = {
        time: el.currentTime,
        paused: el.paused,
        volume: el.volume,
        muted: el.muted,
      };
  }, []);
  const playback = useVideoPlayback({ gameId, eventId, version, enabled, beforeRefresh: snapshot });
  const setPlayer = useCallback(
    (el) => {
      if (player.current && player.current !== el) {
        player.current.pause?.();
        releasePlayback(player.current);
      }
      player.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
      if (el) {
        if (!enabled) el.pause?.();
        else if (autoPlay) el.play?.()?.catch(() => {});
        onReady?.(el);
      }
    },
    [ref, onReady, enabled, autoPlay]
  );
  useEffect(() => {
    const el = player.current;
    if (!el) return;
    if (!enabled) {
      el.pause?.();
      releasePlayback(el);
    } else if (autoPlay) el.play?.()?.catch(() => {});
  }, [enabled, autoPlay]);
  useEffect(() => {
    const el = player.current;
    return () => {
      el?.pause?.();
      releasePlayback(el);
    };
  }, [playback.viewer]);
  useEffect(() => {
    if (playback.isError || mediaError) onUnavailable?.();
  }, [playback.isError, mediaError, onUnavailable]);
  const restore = () => {
    const el = player.current;
    const state = saved.current;
    if (!el || !state) return;
    saved.current = null;
    // This is an observed time from this exact source/clip, never the source
    // timestamp of an instant clip and never an assumed zero-based timeline.
    if (Number.isFinite(state.time)) el.currentTime = state.time;
    el.volume = state.volume;
    el.muted = state.muted;
    if (!state.paused && enabled) el.play?.()?.catch(() => {});
    else el.pause?.();
  };
  if (playback.isError || mediaError)
    return (
      <div
        className={`flex items-center justify-center bg-slate-950 p-6 text-sm text-slate-400 ${className}`}
        role="status"
      >
        Video unavailable
      </div>
    );
  // V21: a visibility-controlled card (`active` set) starts on its own when
  // in view; a Play button there could never do anything.
  if (!enabled && !playback.data && active !== undefined)
    return (
      <div
        className={`flex aspect-video w-full items-center justify-center bg-slate-950 text-sm text-slate-400 ${className}`}
        aria-label={title}
        role="img"
      >
        ▶
      </div>
    );
  if (!enabled && !playback.data)
    return (
      <button
        type="button"
        onClick={() => setIntent(true)}
        className={`flex aspect-video w-full items-center justify-center bg-slate-950 text-sm font-semibold text-white ${className}`}
        aria-label={`Play ${title}`}
      >
        ▶ Play video
      </button>
    );
  if (!playback.data || playbackExpiresAt(playback.data) <= Date.now())
    return (
      <div
        className={`flex aspect-video items-center justify-center bg-slate-950 text-sm text-slate-400 ${className}`}
        role="status"
      >
        Loading video…
      </div>
    );
  if (playback.data.provider !== 'mux') return <p role="status">Video unavailable</p>;
  return (
    <MuxPlayer
      key={playback.viewer}
      ref={setPlayer}
      playbackId={playback.data.playbackId}
      tokens={playback.data.tokens}
      streamType="on-demand"
      loading="page"
      preload="metadata"
      autoPlay={
        enabled && (saved.current ? !saved.current.paused : (playing ?? (autoPlay || intent)))
      }
      muted={muted}
      loop={loop}
      volume={volume}
      playsInline
      disableTracking
      disableCookies
      storyboardSrc={eventId ? '' : undefined}
      metadata={{ video_title: title }}
      className={className}
      style={{
        width: '100%',
        height: fill ? '100%' : undefined,
        aspectRatio: fill ? undefined : '16 / 9',
      }}
      onLoadedMetadata={restore}
      onCanPlay={() => {
        // V21: the refreshed source is playable again, so a later error gets
        // its own one retry (metadata alone is not enough proof).
        retried.current = false;
        restore();
      }}
      onPlay={(e) => {
        setPlaying(true);
        activatePlayback(player.current, () => player.current?.pause());
        onPlay?.(e);
      }}
      onPause={(e) => {
        setPlaying(false);
        onPause?.(e);
      }}
      onEnded={onEnded}
      onTimeUpdate={onTimeUpdate}
      onError={() => {
        if (retried.current) {
          player.current?.pause();
          setMediaError(true);
          return;
        }
        retried.current = true;
        snapshot();
        playback.refetch();
      }}
    />
  );
});
export const MuxVideo = forwardRef(function MuxVideo(props, ref) {
  return (
    <MuxVideoSession
      key={`${props.gameId}:${props.eventId ?? 'full'}:${props.version ?? ''}`}
      {...props}
      ref={ref}
    />
  );
});
