import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LeagueStandingsTable } from '../components/LeagueStandingsTable';
import { leaguesApi } from '../api/leaguesApi';
import { getLeagueHeaderImage } from '../../feed/cardImage';
import { LeagueGameCard } from '../../../components/ui/LeagueGameCard';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { PageHeader } from '../../../components/PageHeader';
import { SportsLoader } from '../../../components/SportsLoader';
import { StatsTable } from '../../teams/components/StatsTable';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';

function formatPercentage(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '--';
}

const LEADERS_COLUMNS = [
  {
    id: 'rank',
    label: '#',
    align: 'left',
    sortable: false,
    render: (row) => row.rank,
  },
  {
    id: 'player',
    label: 'Player',
    align: 'left',
    sortable: false,
    render: (row) => (
      <span className="flex items-center gap-2">
        <img
          src={playerPlaceholder}
          alt=""
          className="h-6 w-6 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
        />
        {row.teamSlug && row.leaguePlayerId ? (
          <Link
            to={`/league/${row.leagueSlug}/teams/${row.teamSlug}/players/${row.leaguePlayerId}`}
            className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:text-sky-700 hover:decoration-sky-500"
          >
            {row.displayName}
          </Link>
        ) : (
          <span className="font-medium text-slate-900">{row.displayName}</span>
        )}
        {row.jerseyNumber != null || row.position ? (
          <span className="text-xs text-slate-500">
            {[row.jerseyNumber != null ? `#${row.jerseyNumber}` : null, row.position]
              .filter(Boolean)
              .join(' · ')}
          </span>
        ) : null}
      </span>
    ),
  },
  {
    id: 'team',
    label: 'Team',
    align: 'left',
    sortable: false,
    render: (row) => (
      <span className="flex items-center gap-1.5">
        <img
          src={row.teamLogoUrl || teamPlaceholder}
          alt=""
          className="h-5 w-5 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
        />
        <span className="text-slate-600">{row.teamName || '—'}</span>
      </span>
    ),
  },
  {
    id: 'gp',
    label: 'GP',
    align: 'right',
    sortKey: 'gamesCount',
    render: (row) => row.gamesCount,
  },
  {
    id: 'ppg',
    label: 'PPG',
    align: 'right',
    sortKey: 'ppg',
    render: (row) => row.ppg.toFixed(1),
  },
  {
    id: 'rpg',
    label: 'RPG',
    align: 'right',
    sortKey: 'rpg',
    render: (row) => row.rpg.toFixed(1),
  },
  {
    id: 'apg',
    label: 'APG',
    align: 'right',
    sortKey: 'apg',
    render: (row) => row.apg.toFixed(1),
  },
  {
    id: 'bpg',
    label: 'BPG',
    align: 'right',
    sortKey: 'bpg',
    render: (row) => row.bpg.toFixed(1),
  },
  {
    id: 'topg',
    label: 'TOV',
    align: 'right',
    sortKey: 'topg',
    render: (row) => row.topg.toFixed(1),
  },
  {
    id: 'fgPct',
    label: 'FG%',
    align: 'right',
    sortKey: 'fgPercentage',
    render: (row) => formatPercentage(row.fgPercentage),
  },
  {
    id: 'spg',
    label: 'SPG',
    align: 'right',
    sortKey: 'spg',
    render: (row) => row.spg.toFixed(1),
  },
  {
    id: 'fp',
    label: 'FP',
    align: 'right',
    sortKey: 'fantasyScore',
    emphasis: true,
    render: (row) => row.fantasyScore.toFixed(1),
  },
];

export function PublicLeaguePage() {
  const { leagueSlug } = useParams();
  const [league, setLeague] = useState(null);
  const [leaders, setLeaders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      leaguesApi.getPublicBySlug(leagueSlug),
      leaguesApi.getPublicLeagueLeaders(leagueSlug),
    ])
      .then(([leagueResponse, leadersResponse]) => {
        setLeague(leagueResponse.league);
        setLeaders(leadersResponse.leaders || []);
      })
      .catch((loadError) => setError(loadError.message || 'Failed to load league'))
      .finally(() => setIsLoading(false));
  }, [leagueSlug]);

  if (isLoading) {
    return <SportsLoader label="Loading league" fullPage />;
  }

  if (!league) {
    return <p className="text-sm text-red-600">{error || 'League not found'}</p>;
  }

  const breadcrumbs = [{ label: 'Leagues' }, { label: league.name }];

  return (
    <main className="space-y-8">
      <Breadcrumbs crumbs={breadcrumbs} />
      <PageHeader
        title={league.name}
        description={`${league.seasonLabel || 'Season TBD'} • Public league standings and game results.`}
        media={
          <img
            src={getLeagueHeaderImage(league)}
            alt={`${league.name} logo`}
            className="h-16 w-16 rounded-full border border-slate-200 bg-white object-cover"
          />
        }
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-900">Standings</h2>
          <Link
            to={`/league/${league.slug}/standings`}
            className="text-sm font-medium text-sky-700 hover:underline"
          >
            View full standings
          </Link>
        </div>
        <LeagueStandingsTable
          standings={league.standings || []}
          getTeamHref={(row) => {
            const team = (league.teams || []).find((t) => t.id === row.teamId);
            return team?.slug ? `/league/${league.slug}/teams/${team.slug}` : null;
          }}
          getTeamLogo={(row) => {
            const team = (league.teams || []).find((t) => t.id === row.teamId);
            return team?.logo?.url ?? null;
          }}
          className="mt-4"
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">Race to MVP</h2>
        {leaders.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No stats recorded yet.</p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <StatsTable
                columns={LEADERS_COLUMNS}
                rows={leaders.map((row, i) => ({ ...row, leagueSlug: league.slug, rank: i + 1 }))}
                tableClassName="w-full text-sm"
              />
            </div>
            <p className="mt-3 text-xs text-slate-400">
              FP = (PPG × 1) + (RPG × 1.2) + (APG × 1.5) + (SPG × 3) + (BPG × 3) + (TOV × −1)
            </p>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-900">Games</h2>
          <Link
            to={`/league/${league.slug}/games`}
            className="text-sm font-medium text-sky-700 hover:underline"
          >
            View all games
          </Link>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(league.games || []).length === 0 ? (
            <p className="text-sm text-slate-600">No league games yet.</p>
          ) : (
            (league.games || []).map((game) => <LeagueGameCard key={game.id} game={game} />)
          )}
        </div>
      </section>
    </main>
  );
}
