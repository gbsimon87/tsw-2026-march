import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { LeagueStandingsTable } from '../components/LeagueStandingsTable';
import { leaguesApi } from '../api/leaguesApi';
import { usePublicLeague } from '../hooks/usePublicLeague';
import { getLeagueHeaderImage } from '../../feed/cardImage';
import { LeagueGameCard } from '../../../components/ui/LeagueGameCard';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { DarkPageHeader } from '../../../components/DarkPageHeader';
import { SportsLoader } from '../../../components/SportsLoader';
import { StatsTable } from '../../teams/components/StatsTable';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';
import { useDocumentMeta } from '../../../hooks/useDocumentMeta';
import { resolveShareImage } from '../../../hooks/resolveShareImage';
import { CloudinaryImage } from '../../media/CloudinaryImage';

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
        <CloudinaryImage
          src={row.avatarUrl || playerPlaceholder}
          alt=""
          width={24}
          height={24}
          loading="lazy"
          decoding="async"
          srcSetWidths={[24, 48, 72]}
          sizes="24px"
          className="h-6 w-6 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
        />
        {row.teamSlug && row.leaguePlayerId ? (
          <Link
            to={`/league/${row.leagueSlug}/teams/${row.teamSlug}/players/${row.leaguePlayerId}`}
            className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:text-[#1B4332] hover:decoration-[#F4A300]"
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
        <CloudinaryImage
          src={row.teamLogoUrl || teamPlaceholder}
          alt=""
          width={20}
          height={20}
          loading="lazy"
          decoding="async"
          srcSetWidths={[20, 40, 60]}
          sizes="20px"
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

const DPOY_COLUMNS = [
  ...LEADERS_COLUMNS.filter((col) => col.id !== 'fp'),
  {
    id: 'dp',
    label: 'DP',
    align: 'right',
    sortKey: 'defensiveScore',
    emphasis: true,
    render: (row) => row.defensiveScore.toFixed(1),
  },
];

export function PublicLeaguePage() {
  const { leagueSlug } = useParams();
  const {
    data: league,
    isLoading: isLeagueLoading,
    isError: isLeagueError,
  } = usePublicLeague(leagueSlug);
  const {
    data: leadersData,
    isLoading: isLeadersLoading,
    isError: isLeadersError,
  } = useQuery({
    queryKey: ['publicLeagueLeaders', leagueSlug],
    queryFn: () => leaguesApi.getPublicLeagueLeaders(leagueSlug),
    enabled: Boolean(leagueSlug),
  });

  const leaders = leadersData?.leaders || [];
  const dpoyLeaders = leadersData?.dpoyLeaders || [];
  const isLoading = isLeagueLoading || isLeadersLoading;
  const error = isLeagueError || isLeadersError ? 'Failed to load league' : '';

  useDocumentMeta({
    title: league ? `${league.name} — League Standings & Games` : undefined,
    description: league
      ? `${league.seasonLabel || 'Season TBD'} • Public league standings and game results.`
      : undefined,
    image: league ? resolveShareImage(league.logo?.url) : undefined,
    url: league ? `${window.location.origin}/league/${league.slug}` : undefined,
  });

  if (isLoading) {
    return <SportsLoader label="Loading league" fullPage />;
  }

  if (!league) {
    return <p className="text-sm text-red-600">{error || 'League not found'}</p>;
  }

  const breadcrumbs = [{ label: 'Discover', href: '/home' }, { label: league.name }];

  return (
    <main className="space-y-6 bg-[#F7F5F0] -m-4 p-4 md:-m-6 md:p-6">
      <Breadcrumbs crumbs={breadcrumbs} />

      {/* League card header */}
      <DarkPageHeader
        titleAriaLabel={league.name}
        eyebrow="League"
        title={league.name}
        description={`${league.seasonLabel || 'Season TBD'} • Public league standings and game results.`}
        media={
          <CloudinaryImage
            src={getLeagueHeaderImage(league)}
            alt={`${league.name} logo`}
            width={64}
            height={64}
            loading="eager"
            decoding="async"
            srcSetWidths={[64, 128, 192]}
            sizes="64px"
            className="h-16 w-16 shrink-0 rounded-full border-2 border-white/10 bg-white object-cover"
          />
        }
      />

      <section className="rounded-2xl bg-white border border-slate-200 p-6 md:p-8">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
              League table
            </p>
            <h2
              className="mt-1 text-2xl text-slate-900"
              style={{ fontFamily: "'Archivo Black', sans-serif" }}
            >
              Standings
            </h2>
          </div>
          <Link
            to={`/league/${league.slug}/standings`}
            className="text-sm font-semibold text-slate-900 underline decoration-[#F4A300] decoration-2 underline-offset-4 hover:text-[#1B4332]"
          >
            View full standings
          </Link>
        </header>
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

      <section className="rounded-2xl bg-white border border-slate-200 p-6 md:p-8">
        <header className="border-b border-slate-100 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
            Leaderboard
          </p>
          <h2
            className="mt-1 text-2xl text-slate-900"
            style={{ fontFamily: "'Archivo Black', sans-serif" }}
          >
            MVP Standings
          </h2>
        </header>
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
              FP = (PPG x 1) + (RPG x 1.2) + (APG x 1.5) + (SPG x 2) + (BPG x 2) - (TOV x 1)
            </p>
          </>
        )}
      </section>

      <section className="rounded-2xl bg-white border border-slate-200 p-6 md:p-8">
        <header className="border-b border-slate-100 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
            Leaderboard
          </p>
          <h2
            className="mt-1 text-2xl text-slate-900"
            style={{ fontFamily: "'Archivo Black', sans-serif" }}
          >
            Defensive Player of the Season
          </h2>
        </header>
        {dpoyLeaders.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No stats recorded yet.</p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <StatsTable
                columns={DPOY_COLUMNS}
                rows={dpoyLeaders.map((row, i) => ({
                  ...row,
                  leagueSlug: league.slug,
                  rank: i + 1,
                }))}
                tableClassName="w-full text-sm"
              />
            </div>
            <p className="mt-3 text-xs text-slate-400">
              DP = (RPG x 1.2) + (SPG x 3) + (BPG x 3) - (TOV x 1)
            </p>
          </>
        )}
      </section>

      <section className="rounded-2xl bg-white border border-slate-200 p-6 md:p-8">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
              On the schedule
            </p>
            <h2
              className="mt-1 text-2xl text-slate-900"
              style={{ fontFamily: "'Archivo Black', sans-serif" }}
            >
              Games
            </h2>
          </div>
          <Link
            to={`/league/${league.slug}/games`}
            className="text-sm font-semibold text-slate-900 underline decoration-[#F4A300] decoration-2 underline-offset-4 hover:text-[#1B4332]"
          >
            View all games
          </Link>
        </header>
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
