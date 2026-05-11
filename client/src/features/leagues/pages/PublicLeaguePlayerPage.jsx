import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { leaguesApi } from '../api/leaguesApi';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import { getLeagueHeaderImage } from '../../feed/cardImage';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { SportsLoader } from '../../../components/SportsLoader';
import { StatsTable } from '../../teams/components/StatsTable';

function formatGameDate(game) {
  const rawValue = game.completedAt || game.scheduledAt || game.createdAt || null;
  if (!rawValue) {
    return 'Date unavailable';
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date unavailable';
  }

  return parsed.toLocaleDateString();
}

function formatAverage(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

export function PublicLeaguePlayerPage() {
  const { leagueSlug, teamSlug, leaguePlayerId } = useParams();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    leaguesApi
      .getPublicPlayer(leagueSlug, teamSlug, leaguePlayerId)
      .then(setData)
      .catch((loadError) => setError(loadError.message || 'Failed to load player'))
      .finally(() => setIsLoading(false));
  }, [leagueSlug, teamSlug, leaguePlayerId]);

  const totals = useMemo(() => {
    return (data?.games || []).reduce(
      (summary, game) => ({
        points: summary.points + game.stats.points,
        reb: summary.reb + game.stats.reb,
        ast: summary.ast + game.stats.ast,
        stl: summary.stl + game.stats.stl,
        blk: summary.blk + (game.stats.blk || 0),
        tov: summary.tov + game.stats.tov,
        foul: summary.foul + game.stats.foul,
      }),
      { points: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, foul: 0 }
    );
  }, [data]);

  if (isLoading) {
    return <SportsLoader label="Loading player" fullPage />;
  }

  if (!data?.player) {
    return <p className="text-sm text-red-600">{error || 'League player not found'}</p>;
  }

  const { league, team, player, summary, games } = data;
  const playerLabel =
    typeof player.jerseyNumber === 'number'
      ? `#${player.jerseyNumber} ${player.displayName}`
      : player.displayName;
  const averageStats = [
    { label: 'GP', value: summary.gamesCount },
    { label: 'PPG', value: formatAverage(summary.pointsPerGame) },
    { label: 'RPG', value: formatAverage(summary.reboundsPerGame) },
    { label: 'APG', value: formatAverage(summary.assistsPerGame) },
  ];
  const totalStats = [
    { label: 'PTS', value: totals.points, featured: true },
    { label: 'REB', value: totals.reb, featured: true },
    { label: 'AST', value: totals.ast, featured: true },
    { label: 'STL', value: totals.stl },
    { label: 'BLK', value: totals.blk },
    { label: 'TOV', value: totals.tov },
    { label: 'FOUL', value: totals.foul },
  ];
  const gameLogRows = games.map((game) => ({
    id: game.gameId,
    opponent: game.opponent || 'Opponent',
    opponentLogoUrl: game.opponentLogoUrl || null,
    opponentHref: game.opponentDestination?.href || `/games/${game.gameId}`,
    dateLabel: formatGameDate(game),
    dateValue: game.completedAt || game.scheduledAt || game.createdAt || null,
    ...game.stats,
    blk: game.stats.blk || 0,
  }));
  const gameLogColumns = [
    {
      id: 'opponent',
      label: 'Opp',
      align: 'left',
      sortKey: 'opponent',
      render: (row) => (
        <Link
          to={row.opponentHref}
          className="inline-flex items-center gap-2 font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:text-sky-700 hover:decoration-sky-500"
        >
          <img
            src={row.opponentLogoUrl || teamPlaceholder}
            alt=""
            className="h-6 w-6 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
          />
          <span>{row.opponent}</span>
        </Link>
      ),
    },
    {
      id: 'date',
      label: 'Date',
      align: 'left',
      sortKey: 'dateValue',
      render: (row) => row.dateLabel,
    },
    { id: 'points', label: 'PTS', align: 'right', render: (row) => row.points },
    { id: 'reb', label: 'REB', align: 'right', render: (row) => row.reb },
    { id: 'ast', label: 'AST', align: 'right', render: (row) => row.ast },
    { id: 'stl', label: 'STL', align: 'right', render: (row) => row.stl },
    { id: 'blk', label: 'BLK', align: 'right', render: (row) => row.blk },
    { id: 'tov', label: 'TOV', align: 'right', render: (row) => row.tov },
    { id: 'foul', label: 'FOUL', align: 'right', render: (row) => row.foul },
  ];

  const breadcrumbs = [
    { label: 'Leagues' },
    { label: league.name, href: `/league/${league.slug}` },
    { label: team.name, href: `/league/${league.slug}/teams/${team.slug}` },
    { label: player.displayName },
  ];

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <Breadcrumbs crumbs={breadcrumbs} />
      <section
        aria-labelledby="league-player-profile-title"
        className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6"
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:justify-start">
            <img
              src={player.avatarUrl || playerPlaceholder}
              alt=""
              className="h-20 w-20 rounded-2xl border border-slate-200 bg-white object-cover shadow-sm"
            />
            <div className="ml-auto grid grid-cols-4 gap-2 rounded-2xl bg-slate-50 p-2 sm:ml-0">
              {averageStats.map((stat) => (
                <div
                  key={stat.label}
                  className="min-w-14 rounded-xl bg-white px-3 py-2 text-center"
                >
                  <p className="text-lg font-bold leading-none text-slate-900">{stat.value}</p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1
                id="league-player-profile-title"
                className="text-2xl font-bold leading-tight text-slate-900 md:text-3xl"
              >
                {playerLabel}
              </h1>
              {player.isClaimed && (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 12l3 3 5-5" />
                  </svg>
                  {player.claimedBadgeLabel}
                </span>
              )}
            </div>
            <nav aria-label="Player affiliations" className="mt-3">
              <ul className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold uppercase tracking-wide text-sky-700">
                <li>
                  <Link
                    to={`/league/${league.slug}`}
                    className="inline-flex items-center gap-2 transition hover:text-sky-900 hover:underline"
                  >
                    <img
                      src={getLeagueHeaderImage(league)}
                      alt=""
                      className="h-5 w-5 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                    />
                    <span>{league.name}</span>
                  </Link>
                </li>
                <li aria-hidden="true" className="text-slate-300">
                  /
                </li>
                <li>
                  <Link
                    to={`/league/${league.slug}/teams/${team.slug}`}
                    className="inline-flex items-center gap-2 transition hover:text-sky-900 hover:underline"
                  >
                    <img
                      src={team.logo?.url || teamPlaceholder}
                      alt=""
                      className="h-5 w-5 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                    />
                    <span>{team.name}</span>
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-500">Season Totals</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">Production Snapshot</h2>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {summary.gamesCount} GP
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {totalStats.map((stat) => (
            <article
              key={stat.label}
              className={`rounded-2xl border p-4 text-center ${
                stat.featured
                  ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-900'
              }`}
            >
              <p
                className={`text-2xl font-bold leading-none ${
                  stat.featured ? 'text-white' : 'text-slate-900'
                }`}
              >
                {stat.value}
              </p>
              <p
                className={`mt-2 text-[10px] font-semibold uppercase tracking-wide ${
                  stat.featured ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                {stat.label}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">Game Log</h2>
        <div className="mt-4 overflow-x-auto">
          <StatsTable columns={gameLogColumns} rows={gameLogRows} tableClassName="w-full text-sm" />
        </div>
      </section>
    </main>
  );
}
