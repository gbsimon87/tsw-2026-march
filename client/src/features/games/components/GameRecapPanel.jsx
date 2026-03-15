import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RecapShotSnapshot } from './RecapShotSnapshot';

function formatDateTime(value) {
  if (!value) {
    return 'Date unavailable';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date unavailable';
  }

  return parsed.toLocaleString();
}

function formatPercentage(value) {
  return value == null ? '--' : `${value.toFixed(0)}%`;
}

function formatMomentTime(value) {
  if (!value) {
    return '--:--';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '--:--';
  }

  return parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function GameRecapPanel({ gameId, recap, teamId }) {
  const [copyState, setCopyState] = useState('');
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/games/${gameId}` : '';

  async function copyLink() {
    if (!navigator?.clipboard?.writeText || !shareUrl) {
      return;
    }

    await navigator.clipboard.writeText(shareUrl);
    setCopyState('copied');
    window.setTimeout(() => {
      setCopyState((current) => (current === 'copied' ? '' : current));
    }, 1500);
  }

  async function shareRecap() {
    if (!shareUrl) {
      return;
    }

    if (navigator?.share) {
      await navigator.share({
        title: recap?.team?.name ? `${recap.team.name} Game Recap` : 'Game Recap',
        text: `${recap?.team?.name || 'Team'} scored ${recap?.team?.points || 0} points${
          recap?.opponent?.name ? ` vs ${recap.opponent.name}` : ''
        }. View the recap and full stats.`,
        url: shareUrl,
      });
      return;
    }

    await copyLink();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-gradient-to-r from-amber-50 via-white to-sky-50 p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          {recap?.statusLabel || 'Game Recap'}
        </p>
        <div className="mt-3 grid gap-4 md:grid-cols-[1.5fr,1fr] md:items-end">
          <div>
            <h2 className="text-3xl font-bold leading-tight text-slate-900 md:text-4xl">
              {recap?.team?.name || 'Team'}
            </h2>
            <p className="mt-2 text-base text-slate-700">
              {recap?.opponent?.name ? `vs ${recap.opponent.name}` : 'Opponent not recorded'}
            </p>
            <p className="mt-2 text-sm text-slate-600">{formatDateTime(recap?.playedAt)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 text-right shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Team Score
            </p>
            <p className="mt-2 text-5xl font-bold text-slate-900">{recap?.team?.points || 0}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={shareRecap}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Share Game Recap
          </button>
          <button
            type="button"
            onClick={copyLink}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            {copyState === 'copied' ? 'Link Copied' : 'Copy Link'}
          </button>
          <Link
            to={`/teams/${teamId}`}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            View Team Page
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {(recap?.topPerformers || []).map((player) => (
          <article
            key={player.playerId}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Top Performer
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">{player.displayName}</h3>
            <p className="mt-3 text-sm text-slate-600">
              {player.points} PTS • {player.reb} REB • {player.ast} AST
            </p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">Team Stats</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Points</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {recap?.teamStats?.points || 0}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">FG2%</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatPercentage(recap?.teamStats?.fg2?.percentage)}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">FG3%</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatPercentage(recap?.teamStats?.fg3?.percentage)}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">FT%</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {formatPercentage(recap?.teamStats?.ft?.percentage)}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rebounds</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{recap?.teamStats?.reb || 0}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assists</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{recap?.teamStats?.ast || 0}</p>
          </article>
        </div>
      </section>

      <RecapShotSnapshot shotSnapshot={recap?.shotSnapshot} />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold text-slate-900">Key Moments</h3>
          <p className="text-sm text-slate-500">{(recap?.keyMoments || []).length} highlights</p>
        </div>

        {(recap?.keyMoments || []).length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">
            No key moments were available for this game.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {recap.keyMoments.map((moment) => (
              <li
                key={moment.eventId}
                className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {formatMomentTime(moment.occurredAt)}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {moment.playerName} • {moment.statLabel}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
