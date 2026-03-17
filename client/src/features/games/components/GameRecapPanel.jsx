import { useState } from 'react';
import { Link } from 'react-router-dom';
import { createRecapCardDataUrl, createRecapCardSvg } from '../recapCardImage';

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

function ShareIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none">
      <path
        d="M12.5 4.5h3v3M8 12l7.5-7.5M15.5 10.5v4a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon({ downloaded = false }) {
  if (downloaded) {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none">
        <path
          d="m5 10 3.2 3.2L15 6.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none">
      <path
        d="M10 3.5v8m0 0 3-3m-3 3-3-3M4.5 13.5v1a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FeedIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5" fill="none">
      <path
        d="M4 14.5V5.5a1 1 0 0 1 1-1h7.2a1 1 0 0 1 .6.2l2.2 1.7a1 1 0 0 1 .4.8v7.3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1ZM7 8h5.5M7 11h5.5M7 14h3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GameRecapPanel({ gameId, team, recap, onShareToFeed }) {
  const [imageState, setImageState] = useState('');
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/games/${gameId}` : '';
  const recapCardDataUrl = createRecapCardDataUrl(recap, { teamLogoUrl: team?.logo?.url || null });
  const cardFilename = `${(recap?.team?.name || 'team')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}-game-recap.svg`;
  const shareText = `${recap?.team?.name || 'Team'}${
    recap?.opponent?.name ? ` vs ${recap.opponent.name}` : ''
  } final: ${recap?.team?.points || 0}-${recap?.opponent?.points || 0}.`;

  function downloadCard() {
    if (!shareUrl) {
      return;
    }

    const link = document.createElement('a');
    link.href = recapCardDataUrl;
    link.download = cardFilename;
    document.body.append(link);
    link.click();
    link.remove();
    setImageState('downloaded');
    window.setTimeout(() => {
      setImageState((current) => (current === 'downloaded' ? '' : current));
    }, 1500);
  }

  async function shareImageCard() {
    const svgMarkup = createRecapCardSvg(recap, { teamLogoUrl: team?.logo?.url || null });

    if (navigator?.share && navigator?.canShare) {
      const file = new File([svgMarkup], cardFilename, { type: 'image/svg+xml' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: recap?.team?.name ? `${recap.team.name} Game Recap Card` : 'Game Recap Card',
          text: shareText,
          url: shareUrl,
          files: [file],
        });
        return;
      }
    }

    downloadCard();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Shareable Image Card</h3>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={shareImageCard}
              aria-label="Share image card"
              title="Share image card"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <ShareIcon />
            </button>
            <button
              type="button"
              onClick={downloadCard}
              aria-label="Download image card"
              title={imageState === 'downloaded' ? 'Downloaded' : 'Download image card'}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <DownloadIcon downloaded={imageState === 'downloaded'} />
            </button>
            <button
              type="button"
              onClick={onShareToFeed}
              aria-label="Share to feed"
              title="Share to feed"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <FeedIcon />
            </button>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <img
            src={recapCardDataUrl}
            alt="Shareable game recap card preview"
            className="mx-auto block w-full max-w-[320px] rounded-xl border border-slate-200 bg-white shadow-sm"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">Team Stats</h3>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Points</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {recap?.teamStats?.points || 0}
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
          <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Steals</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{recap?.teamStats?.stl || 0}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Turnovers
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{recap?.teamStats?.tov || 0}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fouls</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{recap?.teamStats?.foul || 0}</p>
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
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {(recap?.topPerformers || []).map((player) =>
          player.playerId && team?.id ? (
            <Link
              key={player.playerId}
              to={`/teams/${team.id}/players/${player.playerId}`}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:bg-sky-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Top Performer
              </p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">{player.displayName}</h3>
              <p className="mt-3 text-sm text-slate-600">
                {player.points} PTS • {player.reb} REB • {player.ast} AST
              </p>
            </Link>
          ) : (
            <article
              key={player.playerId || player.displayName}
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
          )
        )}
      </section>

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
