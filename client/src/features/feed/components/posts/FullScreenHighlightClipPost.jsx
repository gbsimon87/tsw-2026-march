import { extractYouTubeVideoId } from '../../../games/youtube';
import { STAT_LABELS } from '../../../games/constants';
import { useYouTubeAutoplay } from '../../hooks/useYouTubeAutoplay';
import CloudinaryImage from '../../../media/CloudinaryImage';

export function FullScreenHighlightClipPost({ highlightClip }) {
  const { videoUrl, videoTimestamp, statType, playerName } = highlightClip;
  const videoId = extractYouTubeVideoId(videoUrl);

  const label = STAT_LABELS[statType] || statType;
  const safeTimestamp = Number.isFinite(videoTimestamp) ? videoTimestamp : null;
  const start = safeTimestamp !== null ? Math.max(0, safeTimestamp - 5) : null;
  const end = safeTimestamp !== null ? safeTimestamp + 5 : null;

  const embedSrc =
    videoId && safeTimestamp !== null
      ? `https://www.youtube.com/embed/${videoId}?start=${start}&end=${end}&mute=1&playsinline=1&controls=0&loop=1&playlist=${videoId}&rel=0&modestbranding=1&enablejsapi=1`
      : null;

  const { containerRef, iframeRef } = useYouTubeAutoplay({ src: embedSrc, threshold: 0.6 });

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-slate-950">
      {videoId ? (
        <>
          {/* Thumbnail visible while iframe lazy-loads */}
          <CloudinaryImage
            src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
            alt=""
            width={640}
            height={360}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/*
            Cover-fit the 16:9 iframe to fill the portrait container with no black bars.
            width: max(100%, dvh×16/9) — fills the full height edge-to-edge
            height: max(100%, dvw×9/16) — never shorter than the container
            Centred + overflow-hidden on parent clips the overflowing sides.
          */}
          <iframe
            ref={iframeRef}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: 'max(100%, calc(100dvh * 16 / 9))',
              height: 'max(100%, calc(100dvw * 9 / 16))',
            }}
            title={`${playerName ? `${playerName} — ` : ''}${label}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </>
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
