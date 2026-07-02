import { Link } from 'react-router-dom';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import { extractYouTubeVideoId } from '../youtube.js';
import { GameVideoEmbed } from './GameVideoEmbed';
import { GameStatsCharts } from './GameStatsCharts';

const HIGHLIGHT_LABELS = {
  FG2_MADE: '2PT Make',
  FG2_MISS: '2PT Miss',
  FG3_MADE: '3PT Make',
  FG3_MISS: '3PT Miss',
  FT_MADE: 'FT Make',
  FT_MISS: 'FT Miss',
  AST: 'Assist',
  STL: 'Steal',
  BLK: 'Block',
};

const HIGHLIGHT_PRIORITY = { FG3_MADE: 0, FG2_MADE: 1 };
const MAX_HIGHLIGHTS = 5;

function selectHighlights(highlights) {
  return [...(highlights || [])]
    .filter(Boolean)
    .sort((a, b) => (HIGHLIGHT_PRIORITY[a?.statType] ?? 2) - (HIGHLIGHT_PRIORITY[b?.statType] ?? 2))
    .slice(0, MAX_HIGHLIGHTS);
}

function getParticipantName(participants, side) {
  return participants?.[side]?.displayName || side;
}

function GameHighlightClip({
  videoUrl,
  timestamp,
  statType,
  playerName,
  teamSide,
  participantName,
}) {
  const videoId = extractYouTubeVideoId(videoUrl);
  if (!videoId) return null;
  const safeTimestamp = Number.isFinite(timestamp) ? timestamp : 0;
  const start = Math.max(0, safeTimestamp - 5);
  const end = safeTimestamp + 5;
  const src = `https://www.youtube.com/embed/${videoId}?start=${start}&end=${end}&autoplay=0&controls=1&rel=0&modestbranding=1&playsinline=1`;
  const label = HIGHLIGHT_LABELS[statType] || statType;
  const sideLabel = participantName || teamSide || null;
  return (
    <div className="flex w-64 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="aspect-video w-full bg-slate-950">
        <iframe
          className="h-full w-full"
          src={src}
          title={`${playerName ? `${playerName} — ` : ''}${label}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-semibold text-slate-900">{label}</p>
        {playerName ? <p className="truncate text-xs text-slate-600">{playerName}</p> : null}
        {sideLabel ? <p className="truncate text-xs text-slate-400">{sideLabel}</p> : null}
      </div>
    </div>
  );
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

export function GameRecapPanel({
  team,
  league = null,
  participants,
  isDualTeam = false,
  recap,
  aiSummary = null,
  videoUrl = null,
  videoTitle = null,
  highlights = [],
  sharedEventIds = [],
  canShareHighlights = false,
  clipShareState = {},
  onShareHighlightClip = null,
}) {
  return (
    <div className="space-y-5">
      {aiSummary?.text ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Game Summary
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{aiSummary.text}</p>
        </section>
      ) : null}

      {videoUrl ? <GameVideoEmbed videoUrl={videoUrl} title={videoTitle} /> : null}

      {highlights.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-xl font-semibold text-slate-900">Highlights</h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {selectHighlights(highlights).map((h) => {
              const clipState =
                clipShareState[h.eventId] ||
                (sharedEventIds?.includes(h.eventId) ? 'shared' : 'idle');
              return (
                <div key={h.eventId} className="flex shrink-0 flex-col">
                  <GameHighlightClip
                    videoUrl={h.videoUrl}
                    timestamp={h.videoTimestamp}
                    statType={h.statType}
                    playerName={h.playerName}
                    teamSide={h.teamSide}
                    participantName={
                      isDualTeam && h.teamSide ? getParticipantName(participants, h.teamSide) : null
                    }
                  />
                  {canShareHighlights ? (
                    <button
                      type="button"
                      disabled={clipState === 'loading' || clipState === 'shared'}
                      onClick={() => onShareHighlightClip?.(h.eventId)}
                      aria-label={
                        clipState === 'loading'
                          ? 'Sharing…'
                          : clipState === 'shared'
                            ? 'Shared to Pulse'
                            : clipState !== 'idle'
                              ? clipState
                              : 'Share to Pulse'
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-200 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {clipState === 'loading'
                        ? 'Sharing…'
                        : clipState === 'shared'
                          ? '✓ Shared to Pulse'
                          : clipState !== 'idle'
                            ? clipState
                            : 'Share to Pulse'}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

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
                  aria-hidden="true"
                  className="h-8 w-8 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                />
                <div>
                  <p
                    className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                    title="Real-world clock time when this moment was recorded"
                  >
                    at {formatMomentTime(moment.occurredAt)}
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

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start">
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
                    <th
                      scope="col"
                      aria-label={recap?.home?.name || 'Home'}
                      className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-700"
                    >
                      <span className="sr-only">Home team: </span>
                      <div className="flex items-center justify-center gap-1.5">
                        <img
                          src={participants?.home?.logo?.url || teamPlaceholder}
                          alt=""
                          aria-hidden="true"
                          className="h-5 w-5 rounded-full border border-slate-200 bg-white object-cover"
                        />
                        <span>{recap?.home?.name || 'Home'}</span>
                      </div>
                    </th>
                    <th
                      scope="col"
                      aria-label={recap?.away?.name || 'Away'}
                      className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-700"
                    >
                      <span className="sr-only">Away team: </span>
                      <div className="flex items-center justify-center gap-1.5">
                        <img
                          src={participants?.away?.logo?.url || teamPlaceholder}
                          alt=""
                          aria-hidden="true"
                          className="h-5 w-5 rounded-full border border-slate-200 bg-white object-cover"
                        />
                        <span>{recap?.away?.name || 'Away'}</span>
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

          <GameStatsCharts
            isDualTeam={isDualTeam}
            homeStats={recap?.homeStats}
            awayStats={recap?.awayStats}
            teamStats={recap?.teamStats}
            homeLabel={recap?.home?.name || 'Home'}
            awayLabel={recap?.away?.name || 'Away'}
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">Top Performers</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-3 lg:grid-cols-1">
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
                      aria-hidden="true"
                      className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Top Performer
                      </p>
                      <h3
                        className="truncate text-lg font-semibold text-slate-900"
                        aria-label={player.displayName}
                      >
                        {player.displayName || 'Unknown Player'}
                      </h3>
                    </div>
                  </div>
                  {isDualTeam && player.teamName ? (
                    <div className="mt-3 flex items-center gap-1.5">
                      <img
                        src={teamLogo}
                        alt=""
                        aria-hidden="true"
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
                    return `/league/${league.slug}/teams/${participant.slug}/players/${
                      player.leaguePlayerId || player.playerId
                    }`;
                  }
                  return null;
                }
                if (league?.slug && team?.slug) {
                  return `/league/${league.slug}/teams/${team.slug}/players/${
                    player.leaguePlayerId || player.playerId
                  }`;
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
          </div>
        </section>
      </div>
    </div>
  );
}
