import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
      <section className="rounded-3xl bg-gradient-to-r from-sky-50 via-white to-amber-50 p-8 md:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Public League Standings
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">{league.name}</h1>
        <p className="mt-2 text-base text-slate-700">
          {league.seasonLabel || 'Season TBD'} standings with record, PF, PA, and differential.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
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
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900">Standings</h2>
        <LeagueStandingsTable standings={standings} />
      </section>
    </main>
  );
}
