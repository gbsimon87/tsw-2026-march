import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { PageHeader } from '../../../components/PageHeader';
import { SportsLoader } from '../../../components/SportsLoader';
import { LeagueStandingsTable } from '../components/LeagueStandingsTable';
import { leaguesApi } from '../api/leaguesApi';
import { getLeagueHeaderImage } from '../../feed/cardImage';

export function PublicLeagueStandingsPage() {
  const { leagueSlug } = useParams();
  const [league, setLeague] = useState(null);
  const [standings, setStandings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([leaguesApi.getPublicBySlug(leagueSlug), leaguesApi.getPublicStandings(leagueSlug)])
      .then(([leagueResponse, standingsResponse]) => {
        setLeague(leagueResponse.league);
        setStandings(standingsResponse.standings || []);
      })
      .catch((loadError) => setError(loadError.message || 'Failed to load standings'))
      .finally(() => setIsLoading(false));
  }, [leagueSlug]);

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
    <main className="space-y-8">
      <Breadcrumbs crumbs={breadcrumbs} />
      <PageHeader
        eyebrow="Public League Standings"
        title={league.name}
        description={`${league.seasonLabel || 'Season TBD'} standings with record, PF, PA, and differential.`}
        media={
          <img
            src={getLeagueHeaderImage(league)}
            alt={`${league.name} logo`}
            className="h-16 w-16 rounded-full border border-slate-200 bg-white object-cover"
          />
        }
      >
        <div className="flex flex-wrap gap-3 text-sm">
          <Link to={`/league/${league.slug}`} className="font-medium text-sky-700 hover:underline">
            League overview
          </Link>
          <Link
            to={`/league/${league.slug}/games`}
            className="font-medium text-sky-700 hover:underline"
          >
            League games
          </Link>
        </div>
      </PageHeader>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">Standings</h2>
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
        />
      </section>
    </main>
  );
}
