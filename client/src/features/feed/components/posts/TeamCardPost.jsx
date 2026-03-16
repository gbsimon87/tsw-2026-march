import { Link } from 'react-router-dom';
import { useState } from 'react';
import { getTeamCardImage } from '../../cardImage';

function formatPercentage(value) {
  return value == null ? '--' : `${value.toFixed(0)}%`;
}

export function TeamCardPost({ teamCard }) {
  const [imageSrc, setImageSrc] = useState(() => getTeamCardImage(teamCard));

  return (
    <Link
      to={teamCard.teamUrl}
      className="block rounded-2xl border border-slate-200 bg-gradient-to-br from-amber-50 via-white to-sky-50 p-5 transition hover:border-sky-300"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Team Card</p>
      <div className="mt-3 flex items-center gap-4">
        <img
          src={imageSrc}
          alt={`${teamCard.teamName} card logo`}
          className="h-20 w-20 rounded-full border border-slate-200 bg-white object-cover"
          onError={() => setImageSrc(getTeamCardImage({}))}
        />
        <div className="min-w-0">
          <h3 className="text-2xl font-bold text-slate-900">{teamCard.teamName}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {teamCard.summary.gamesCount} completed public games
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <article className="rounded-xl border border-slate-200 bg-white/80 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Points</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{teamCard.summary.points}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white/80 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">FG2%</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatPercentage(teamCard.summary.fg2.percentage)}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white/80 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">FG3%</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatPercentage(teamCard.summary.fg3.percentage)}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white/80 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">FT%</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatPercentage(teamCard.summary.ft.percentage)}
          </p>
        </article>
      </div>
    </Link>
  );
}
