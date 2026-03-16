import { Link } from 'react-router-dom';
import { useState } from 'react';
import { getPlayerCardImage } from '../../cardImage';

function formatAverage(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

function PlayerCardContent({ imageSrc, playerCard, onImageError }) {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Player Card</p>
      <div className="mt-3 flex items-center gap-4">
        <img
          src={imageSrc}
          alt={`${playerCard.playerName} card avatar`}
          className="h-20 w-20 rounded-full border border-slate-200 bg-white object-cover"
          onError={onImageError}
        />
        <div className="min-w-0">
          <h3 className="text-2xl font-bold text-slate-900">{playerCard.playerName}</h3>
          <p className="mt-1 text-sm text-slate-600">{playerCard.teamName}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <article className="rounded-xl border border-slate-200 bg-white/80 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">PPG</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatAverage(playerCard.summary.pointsPerGame)}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white/80 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">RPG</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatAverage(playerCard.summary.reboundsPerGame)}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white/80 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">APG</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatAverage(playerCard.summary.assistsPerGame)}
          </p>
        </article>
      </div>
    </>
  );
}

export function PlayerCardPost({ playerCard, interactive = true }) {
  const [imageSrc, setImageSrc] = useState(() => getPlayerCardImage(playerCard));
  const className =
    'block rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-5';

  if (!interactive) {
    return (
      <article className={className}>
        <PlayerCardContent
          imageSrc={imageSrc}
          playerCard={playerCard}
          onImageError={() => setImageSrc(getPlayerCardImage({}))}
        />
      </article>
    );
  }

  return (
    <Link to={playerCard.playerUrl} className={`${className} transition hover:border-sky-300`}>
      <PlayerCardContent
        imageSrc={imageSrc}
        playerCard={playerCard}
        onImageError={() => setImageSrc(getPlayerCardImage({}))}
      />
    </Link>
  );
}
