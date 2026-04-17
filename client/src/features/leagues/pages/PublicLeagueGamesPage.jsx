import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { leaguesApi } from '../api/leaguesApi';

function formatGameDate(game) {
  const rawValue = game.completedAt || game.scheduledAt || null;
  if (!rawValue) {
    return 'Date unavailable';
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date unavailable';
  }

  return parsed.toLocaleDateString();
}

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

      <section className="grid gap-3">
        {games.map((game) => (
          <Link
            key={game.id}
            to={`/games/${game.id}`}
            className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300"
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-slate-900">{game.title}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {game.awayTeamName} at {game.homeTeamName}
                </p>
              </div>
              <div className="text-sm text-slate-500">
                <p>{formatGameDate(game)}</p>
                <p>
                  {game.teamPoints} - {game.opponentPoints}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
