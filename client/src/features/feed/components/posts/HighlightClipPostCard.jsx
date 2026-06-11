import { extractYouTubeVideoId } from '../../../games/youtube';
import { STAT_LABELS } from '../../../games/constants';
import { useYouTubeAutoplay } from '../../hooks/useYouTubeAutoplay';

export function HighlightClipPostCard({ highlightClip, caption }) {
  const { videoUrl, videoTimestamp, statType, playerName, gameTitle } = highlightClip;
  const videoId = extractYouTubeVideoId(videoUrl);

  const label = STAT_LABELS[statType] || statType;
  const start = Math.max(0, videoTimestamp - 5);
  const end = videoTimestamp + 5;

  const { containerRef, iframeRef } = useYouTubeAutoplay({ threshold: 0.5 });

  return (
    <article
      ref={containerRef}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950"
    >
      {videoId ? (
        <div className="relative aspect-video w-full">
          <iframe
            ref={iframeRef}
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube.com/embed/${videoId}?start=${start}&end=${end}&mute=1&playsinline=1&controls=0&loop=1&playlist=${videoId}&rel=0&modestbranding=1&enablejsapi=1`}
            title={`${playerName ? `${playerName} — ` : ''}${label}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-slate-900">
          <p className="text-sm text-slate-400">Video unavailable</p>
        </div>
      )}
      <div className="bg-white px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        {playerName ? <p className="truncate text-xs text-slate-500">{playerName}</p> : null}
        {gameTitle ? <p className="truncate text-xs text-slate-400">{gameTitle}</p> : null}
        {caption ? <p className="mt-1 text-sm text-slate-700">{caption}</p> : null}
      </div>
    </article>
  );
}
