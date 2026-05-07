import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createRecapCardDataUrl, createRecapCardSvg } from '../recapCardImage';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';

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

export function GameRecapPanel({
  gameId,
  team,
  league = null,
  participants,
  isDualTeam = false,
  recap,
  onShareToFeed,
}) {
  const [imageState, setImageState] = useState('');
  const [recapCardDataUrl, setRecapCardDataUrl] = useState('');
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/games/${gameId}` : '';

  useEffect(() => {
    let cancelled = false;
    const homeLogoUrl = isDualTeam
      ? participants?.home?.logo?.url || null
      : team?.logo?.url || null;
    const awayLogoUrl = isDualTeam ? participants?.away?.logo?.url || null : null;
    const leagueLogoUrl = league?.logo?.url || null;
    createRecapCardDataUrl(recap, {
      homeLogoUrl,
      awayLogoUrl,
      leagueLogoUrl,
      teamColors: team?.colors || [],
    }).then((url) => {
      if (!cancelled) setRecapCardDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [recap, isDualTeam, participants, team, league]);

  const cardFilename = `${(recap?.team?.name || recap?.home?.name || 'team')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}-game-recap.svg`;
  const shareText = isDualTeam
    ? `${participants?.away?.displayName || 'Away'} at ${participants?.home?.displayName || 'Home'} final: ${recap?.home?.points || 0}-${recap?.away?.points || 0}.`
    : `${recap?.team?.name || 'Team'}${
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
    const svgMarkup = createRecapCardSvg(recap, {
      teamLogoUrl: team?.logo?.url || null,
      teamColors: team?.colors || [],
    });

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

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 p-3">
          <img
            src={recapCardDataUrl}
            alt="Shareable game recap card preview"
            className="mx-auto block w-full max-w-[320px] rounded-xl bg-slate-950 shadow-sm"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-900">Game Stats</h3>
        {isDualTeam ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="py-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Stat
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-700">
                    <div className="flex items-center justify-center gap-1.5">
                      <img
                        src={participants?.home?.logo?.url || teamPlaceholder}
                        alt=""
                        className="h-5 w-5 rounded-full border border-slate-200 bg-white object-cover"
                      />
                      {recap?.home?.name || 'Home'}
                    </div>
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-700">
                    <div className="flex items-center justify-center gap-1.5">
                      <img
                        src={participants?.away?.logo?.url || teamPlaceholder}
                        alt=""
                        className="h-5 w-5 rounded-full border border-slate-200 bg-white object-cover"
                      />
                      {recap?.away?.name || 'Away'}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { label: 'Points', key: 'points' },
                  { label: 'Rebounds', key: 'reb' },
                  { label: 'Assists', key: 'ast' },
                  { label: 'Steals', key: 'stl' },
                  { label: 'Blocks', key: 'blk' },
                  { label: 'Turnovers', key: 'tov' },
                  { label: 'Fouls', key: 'foul' },
                ].map(({ label, key }) => (
                  <tr key={key}>
                    <td className="py-2 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {label}
                    </td>
                    <td className="px-3 py-2 text-center text-lg font-bold tabular-nums text-slate-900">
                      {recap?.homeStats?.[key] ?? 0}
                    </td>
                    <td className="px-3 py-2 text-center text-lg font-bold tabular-nums text-slate-900">
                      {recap?.awayStats?.[key] ?? 0}
                    </td>
                  </tr>
                ))}
                {[
                  {
                    label: 'FG2%',
                    homeVal: formatPercentage(recap?.homeStats?.fg2?.percentage),
                    awayVal: formatPercentage(recap?.awayStats?.fg2?.percentage),
                  },
                  {
                    label: 'FG3%',
                    homeVal: formatPercentage(recap?.homeStats?.fg3?.percentage),
                    awayVal: formatPercentage(recap?.awayStats?.fg3?.percentage),
                  },
                  {
                    label: 'FT%',
                    homeVal: formatPercentage(recap?.homeStats?.ft?.percentage),
                    awayVal: formatPercentage(recap?.awayStats?.ft?.percentage),
                  },
                ].map(({ label, homeVal, awayVal }) => (
                  <tr key={label}>
                    <td className="py-2 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {label}
                    </td>
                    <td className="px-3 py-2 text-center text-lg font-bold tabular-nums text-slate-900">
                      {homeVal}
                    </td>
                    <td className="px-3 py-2 text-center text-lg font-bold tabular-nums text-slate-900">
                      {awayVal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              { label: 'Points', value: recap?.teamStats?.points || 0 },
              { label: 'Rebounds', value: recap?.teamStats?.reb || 0 },
              { label: 'Assists', value: recap?.teamStats?.ast || 0 },
              { label: 'Steals', value: recap?.teamStats?.stl || 0 },
              { label: 'Turnovers', value: recap?.teamStats?.tov || 0 },
              { label: 'Fouls', value: recap?.teamStats?.foul || 0 },
              { label: 'FG2%', value: formatPercentage(recap?.teamStats?.fg2?.percentage) },
              { label: 'FG3%', value: formatPercentage(recap?.teamStats?.fg3?.percentage) },
              { label: 'FT%', value: formatPercentage(recap?.teamStats?.ft?.percentage) },
            ].map(({ label, value }) => (
              <article
                key={label}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {(recap?.topPerformers || []).map((player) => {
          const teamLogo =
            isDualTeam && player.teamSide
              ? participants?.[player.teamSide]?.logo?.url || teamPlaceholder
              : null;
          const inner = (
            <>
              <div className="flex items-center gap-3">
                <img
                  src={playerPlaceholder}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Top Performer
                  </p>
                  <h3 className="truncate text-lg font-semibold text-slate-900">
                    {player.displayName}
                  </h3>
                </div>
              </div>
              {isDualTeam && player.teamName ? (
                <div className="mt-3 flex items-center gap-1.5">
                  <img
                    src={teamLogo}
                    alt=""
                    className="h-4 w-4 rounded-full border border-slate-200 bg-white object-cover"
                  />
                  <span className="text-xs font-medium text-slate-500">{player.teamName}</span>
                </div>
              ) : null}
              <p className="mt-3 text-sm font-semibold text-slate-700">
                {player.points} PTS · {player.reb} REB · {player.ast} AST
              </p>
            </>
          );

          const participant = isDualTeam ? participants?.[player.teamSide] : null;
          const playerHref = (() => {
            if (!player.playerId) return null;
            if (isDualTeam) {
              if (league?.slug && participant?.slug) {
                return `/league/${league.slug}/teams/${participant.slug}/players/${player.playerId}`;
              }
              return null;
            }
            return team?.id ? `/teams/${team.id}/players/${player.playerId}` : null;
          })();

          return playerHref ? (
            <Link
              key={player.playerId}
              to={playerHref}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:bg-sky-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            >
              {inner}
            </Link>
          ) : (
            <article
              key={player.playerId || player.displayName}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              {inner}
            </article>
          );
        })}
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
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"
              >
                <img
                  src={playerPlaceholder}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {formatMomentTime(moment.occurredAt)}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-slate-900">
                    {moment.playerName} • {moment.statLabel}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
