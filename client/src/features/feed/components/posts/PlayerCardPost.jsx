import { Link } from 'react-router-dom';

function formatAverage(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

export function PlayerCardPost({ playerCard }) {
  return (
    <Link
      to={playerCard.playerUrl}
      className="block rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50 p-5 transition hover:border-sky-300"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Player Card</p>
      <h3 className="mt-2 text-2xl font-bold text-slate-900">{playerCard.playerName}</h3>
      <p className="mt-1 text-sm text-slate-600">{playerCard.teamName}</p>
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
    </Link>
  );
}
