import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { leaguesApi } from '../api/leaguesApi';
import { LeagueGameCard } from '../../../components/ui/LeagueGameCard';

export function PublicLeagueGamesPage() {
  const { leagueSlug } = useParams();
  const [league, setLeague] = useState(null);
  const [games, setGames] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([leaguesApi.getPublicBySlug(leagueSlug), leaguesApi.getPublicGames(leagueSlug)])
      .then(([leagueResponse, gamesResponse]) => {
        setLeague(leagueResponse.league);
        setGames(gamesResponse.games || []);
      })
      .catch((loadError) => setError(loadError.message || 'Failed to load games'))
      .finally(() => setIsLoading(false));
  }, [leagueSlug]);

  if (isLoading) {
    return <p className="text-sm">Loading league games...</p>;
  }

  if (!league) {
    return <p className="text-sm text-red-600">{error || 'League not found'}</p>;
  }

  return (
    <main className="space-y-8">
      <section className="rounded-3xl bg-gradient-to-r from-sky-50 via-white to-amber-50 p-8 md:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Public League Games
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">{league.name}</h1>
        <p className="mt-2 text-base text-slate-700">
          {league.seasonLabel || 'Season TBD'} schedule and completed results.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link to={`/league/${league.slug}`} className="font-medium text-sky-700 hover:underline">
            League overview
          </Link>
          <Link
            to={`/league/${league.slug}/standings`}
            className="font-medium text-sky-700 hover:underline"
          >
            League standings
          </Link>
        </div>
      </section>

      <section>
        {games.length === 0 ? (
          <p className="text-sm text-slate-600">No league games yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {games.map((game) => (
              <LeagueGameCard key={game.id} game={game} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
