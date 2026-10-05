import { usePlaybackVisibility } from '../hooks/usePlaybackVisibility';
import { HighlightPlayer } from './HighlightPlayer';
import { STAT_LABELS } from '../../games/constants';
export function MuxHighlightFeed({ highlight, caption, fullscreen = false }) {
  const { containerRef, visible } = usePlaybackVisibility(fullscreen ? 0.6 : 0.5);
  const label = STAT_LABELS[highlight.statType] || highlight.statType;
  return (
    <article
      ref={containerRef}
      className={
        fullscreen
          ? 'relative h-full w-full overflow-hidden bg-slate-950'
          : 'overflow-hidden rounded-2xl border border-slate-200 bg-slate-950'
      }
    >
      <div className={fullscreen ? 'h-full w-full' : 'aspect-video w-full'}>
        <HighlightPlayer
          highlight={highlight}
          title={`${highlight.playerName ? `${highlight.playerName} — ` : ''}${label}`}
          active={visible}
          autoPlay
          muted
          loop
          fill
          className="h-full w-full"
        />
      </div>
      <div
        className={
          fullscreen ? 'absolute left-4 top-4 z-10 text-white' : 'bg-white px-4 py-3 text-slate-900'
        }
      >
        <p className="text-sm font-semibold">{label}</p>
        {highlight.playerName ? <p className="text-xs">{highlight.playerName}</p> : null}
        {highlight.gameTitle ? <p className="text-xs">{highlight.gameTitle}</p> : null}
        {caption ? <p className="mt-1 text-sm">{caption}</p> : null}
      </div>
    </article>
  );
}
