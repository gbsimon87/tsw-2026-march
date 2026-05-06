import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { LeagueStandingsTable } from '../components/LeagueStandingsTable';
import { leaguesApi } from '../api/leaguesApi';

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
    return <p className="text-sm">Loading standings...</p>;
  }

  if (!league) {
    return <p className="text-sm text-red-600">{error || 'League not found'}</p>;
  }

  return (
    <main className="space-y-8">
      <PageHeader
        eyebrow="Public League Standings"
        title={league.name}
        description={`${league.seasonLabel || 'Season TBD'} standings with record, PF, PA, and differential.`}
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
