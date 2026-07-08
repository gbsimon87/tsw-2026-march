import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatAverage, getFallbackPlayerImage, getPlayerFallbackState } from './cardUtils';
import CloudinaryImage from '../../../media/CloudinaryImage';

export function FullScreenPlayerCard({ playerCard }) {
  const [imageSrc, setImageSrc] = useState(
    () => playerCard?.playerImage?.url || playerCard?.teamLogo?.url || null
  );

  if (!playerCard) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-900">
        <p className="text-sm text-slate-400">Player info unavailable.</p>
      </div>
    );
  }

  const teamColors = playerCard?.teamColors || [];
  const primary = teamColors[0] || '#334155';
  const secondary = teamColors[1] || '#94a3b8';
  const fallback = getPlayerFallbackState({
    ...playerCard,
    playerImage: imageSrc ? { url: imageSrc } : null,
  });

  const stats = [
    { label: 'PPG', value: formatAverage(playerCard.summary?.pointsPerGame) },
    { label: 'RPG', value: formatAverage(playerCard.summary?.reboundsPerGame) },
    { label: 'APG', value: formatAverage(playerCard.summary?.assistsPerGame) },
  ];

  const inner = (
    <div
      className="flex h-full flex-col"
      style={{ background: `linear-gradient(160deg, ${primary}cc 0%, #0f172a 100%)` }}
    >
      {/* Player image takes top 55% */}
      <div className="relative flex-1 overflow-hidden">
        {fallback.src ? (
          <CloudinaryImage
            src={fallback.src}
            alt={fallback.alt}
            width={640}
            height={640}
            className="h-full w-full object-cover object-top"
            onError={() => setImageSrc(getFallbackPlayerImage())}
            loading="lazy"
            srcSetWidths={[320, 640, 1080]}
            sizes="100vw"
          />
        ) : (
          <div
            className="flex h-full items-center justify-center text-8xl font-black text-white/20"
            style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
          >
            {fallback.initials}
          </div>
        )}
        {/* gradient fade into bottom */}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-950 to-transparent" />
      </div>

      {/* Info panel */}
      <div className="shrink-0 px-6 pb-32 pt-4">
        <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: secondary }}>
          Player Spotlight
          {typeof playerCard.jerseyNumber === 'number' ? ` · #${playerCard.jerseyNumber}` : ''}
        </p>
        <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-white">
          {playerCard.playerName}
        </h2>
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
          {playerCard.teamName}
        </p>

        <div className="mt-6 grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl bg-white/10 px-3 py-4 text-center backdrop-blur-sm"
            >
              <p className="text-2xl font-black text-white">{s.value}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (!playerCard.playerUrl) {
    return <div className="block h-full w-full">{inner}</div>;
  }

  return (
    <Link to={playerCard.playerUrl} className="block h-full w-full focus:outline-none">
      {inner}
    </Link>
  );
}
