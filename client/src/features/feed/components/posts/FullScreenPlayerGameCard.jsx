import { useState } from 'react';
import { Link } from 'react-router-dom';

import { pickContextStat } from '../cards/playerGameCard';
import { formatCompactDate, getFallbackPlayerImage, getPlayerFallbackState } from './cardUtils';
import CloudinaryImage from '../../../media/CloudinaryImage';

// Social backlog rank 2 — the full-screen Pulse slide for a per-game line.
export function FullScreenPlayerGameCard({ playerGameCard }) {
  const [imageSrc, setImageSrc] = useState(
    () => playerGameCard?.playerImage?.url || playerGameCard?.teamLogo?.url || null
  );

  if (!playerGameCard) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-900">
        <p className="text-sm text-slate-400">Performance unavailable.</p>
      </div>
    );
  }

  const teamColors = playerGameCard.teamColors || [];
  const primary = teamColors[0] || '#334155';
  const secondary = teamColors[1] || '#94a3b8';
  const fallback = getPlayerFallbackState({
    ...playerGameCard,
    playerImage: imageSrc ? { url: imageSrc } : null,
  });
  const context = pickContextStat(playerGameCard.stats);
  const stats = [
    { label: 'PTS', value: playerGameCard.stats?.points ?? 0 },
    { label: 'REB', value: playerGameCard.stats?.reb ?? 0 },
    { label: 'AST', value: playerGameCard.stats?.ast ?? 0 },
    { label: context.label, value: context.value },
  ];
  const matchup = [playerGameCard.teamName, playerGameCard.opponentName]
    .filter(Boolean)
    .join(' vs ');

  const inner = (
    <div
      className="flex h-full flex-col"
      style={{ background: `linear-gradient(160deg, ${primary}cc 0%, #0f172a 100%)` }}
    >
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
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-950 to-transparent" />
      </div>

      <div className="shrink-0 px-6 pb-32 pt-4">
        <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: secondary }}>
          Game Performance
          {typeof playerGameCard.jerseyNumber === 'number'
            ? ` · #${playerGameCard.jerseyNumber}`
            : ''}
        </p>
        <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-white">
          {playerGameCard.playerName}
        </h2>
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
          {[matchup, playerGameCard.resultLabel, formatCompactDate(playerGameCard.playedOn)]
            .filter(Boolean)
            .join(' · ')}
        </p>

        <div className="mt-6 grid grid-cols-4 gap-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl bg-white/10 px-2 py-4 text-center backdrop-blur-sm"
            >
              <p className="text-2xl font-black text-white">{stat.value}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (!playerGameCard.gameUrl) {
    return <div className="block h-full w-full">{inner}</div>;
  }

  return (
    <Link to={playerGameCard.gameUrl} className="block h-full w-full focus:outline-none">
      {inner}
    </Link>
  );
}
