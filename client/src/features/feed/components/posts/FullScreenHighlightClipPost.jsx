import { extractYouTubeVideoId } from '../../../games/youtube';
import { STAT_LABELS } from '../../../games/constants';
import { useYouTubeAutoplay } from '../../hooks/useYouTubeAutoplay';

export function FullScreenHighlightClipPost({ highlightClip }) {
  const { videoUrl, videoTimestamp, statType, playerName } = highlightClip;
  const videoId = extractYouTubeVideoId(videoUrl);

  const label = STAT_LABELS[statType] || statType;
  const start = Math.max(0, videoTimestamp - 5);
  const end = videoTimestamp + 5;

  const { containerRef, iframeRef } = useYouTubeAutoplay({ threshold: 0.6 });

  return (
    <div ref={containerRef} className="relative h-full w-full bg-slate-950">
      {videoId ? (
        <iframe
          ref={iframeRef}
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube.com/embed/${videoId}?start=${start}&end=${end}&mute=1&playsinline=1&controls=0&loop=1&playlist=${videoId}&rel=0&modestbranding=1&enablejsapi=1`}
          title={`${playerName ? `${playerName} — ` : ''}${label}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <p className="text-sm text-slate-400">Video unavailable</p>
        </div>
      )}

      <div className="absolute left-4 top-4 z-10">
        <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-sm">
          {label}
        </span>
        {playerName ? (
          <p className="mt-1.5 text-sm font-semibold text-white drop-shadow">{playerName}</p>
        ) : null}
      </div>
    </div>
  );
}
