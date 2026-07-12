import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { DarkPageHeader } from '../../../components/DarkPageHeader';
import { SportsLoader } from '../../../components/SportsLoader';
import { LeagueStandingsTable } from '../components/LeagueStandingsTable';
import { SeasonSelect } from '../components/SeasonSelect';
import { leaguesApi } from '../api/leaguesApi';
import { getLeagueHeaderImage } from '../../feed/cardImage';
import { CloudinaryImage } from '../../media/CloudinaryImage';
import { usePublicLeague } from '../hooks/usePublicLeague';

export function PublicLeagueStandingsPage() {
  const { leagueSlug } = useParams();
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const {
    data: league,
    isLoading: isLeagueLoading,
    isError: isLeagueError,
  } = usePublicLeague(leagueSlug, selectedSeasonId);
  const activeSeasonId = selectedSeasonId || league?.currentSeason?.id || null;
  const {
    data: standingsData,
    isLoading: isStandingsLoading,
    isError: isStandingsError,
  } = useQuery({
    queryKey: ['publicLeagueStandings', leagueSlug, activeSeasonId],
    queryFn: () => leaguesApi.getPublicStandings(leagueSlug, activeSeasonId),
    enabled: Boolean(leagueSlug),
  });

  const standings = standingsData?.standings || [];
  const isLoading = isLeagueLoading || isStandingsLoading;
  const error = isLeagueError || isStandingsError ? 'Failed to load standings' : '';
  const seasons = useMemo(() => league?.seasons || [], [league]);
  const selectedSeason = seasons.find((season) => season.id === activeSeasonId);

  if (isLoading) {
    return <SportsLoader label="Loading standings" fullPage />;
  }

  if (!league) {
    return <p className="text-sm text-red-600">{error || 'League not found'}</p>;
  }

  const breadcrumbs = [
    { label: 'Discover', href: '/home' },
    { label: league.name, href: `/league/${league.slug}` },
    { label: 'Standings' },
  ];

  return (
    <main className="space-y-6 bg-[#F7F5F0] -m-4 p-4 md:-m-6 md:p-6">
      <Breadcrumbs crumbs={breadcrumbs} />

      <DarkPageHeader
        titleAriaLabel={league.name}
        eyebrow="Public League Standings"
        title={league.name}
        description={`${selectedSeason?.label || league.seasonLabel || 'Season TBD'} standings with record, PF, PA, and differential.`}
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
      >
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Link
            to={`/league/${league.slug}`}
            className="font-semibold text-white/80 underline decoration-[#F4A300] decoration-2 underline-offset-4 hover:text-[#F4A300]"
          >
            League overview
          </Link>
          <Link
            to={`/league/${league.slug}/games`}
            className="font-semibold text-white/80 underline decoration-[#F4A300] decoration-2 underline-offset-4 hover:text-[#F4A300]"
          >
            League games
          </Link>
          <SeasonSelect
            seasons={seasons}
            selectedSeasonId={activeSeasonId}
            onChange={setSelectedSeasonId}
            className="ml-auto"
          />
        </div>
      </DarkPageHeader>

      <section className="rounded-2xl bg-white border border-slate-200 p-6 md:p-8">
        <header className="border-b border-slate-100 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
            League table
          </p>
          <h2
            className="mt-1 text-2xl text-slate-900"
            style={{ fontFamily: "'Archivo Black', sans-serif" }}
          >
            Standings
          </h2>
        </header>
        <LeagueStandingsTable
          standings={standings}
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
    </main>
  );
}
