import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LeagueStandingsTable } from '../components/LeagueStandingsTable';
import { leaguesApi } from '../api/leaguesApi';
import { getLeagueHeaderImage } from '../../feed/cardImage';

export function PublicLeaguePage() {
  const { leagueSlug } = useParams();
  const [league, setLeague] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    leaguesApi
      .getPublicBySlug(leagueSlug)
      .then((response) => setLeague(response.league))
      .catch((loadError) => setError(loadError.message || 'Failed to load league'))
      .finally(() => setIsLoading(false));
  }, [leagueSlug]);

  if (isLoading) {
    return <p className="text-sm">Loading league...</p>;
  }

  if (!league) {
    return <p className="text-sm text-red-600">{error || 'League not found'}</p>;
  }

  return (
    <main className="space-y-8">
      <section className="rounded-3xl bg-gradient-to-r from-sky-50 via-white to-amber-50 p-8 md:p-10">
        <div className="flex items-center gap-5">
          <img
            src={getLeagueHeaderImage(league)}
            alt={`${league.name} logo`}
            className="h-16 w-16 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
          />
          <div>
            <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">{league.name}</h1>
            <p className="mt-2 text-base text-slate-700">
              {league.seasonLabel || 'Season TBD'} • Public league standings and game results.
            </p>
          </div>
        </div>
      </section>

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
          className="mt-4"
        />
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
        <div className="mt-4 grid gap-3">
          {(league.games || []).length === 0 ? (
            <p className="text-sm text-slate-600">No league games yet.</p>
          ) : (
            (league.games || []).map((game) => (
              <Link
                key={game.id}
                to={`/games/${game.id}`}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300"
              >
                <p className="font-semibold text-slate-900">
                  {game.homeTeamName || 'Unknown Team'} vs {game.awayTeamName || 'Unknown Team'}
                </p>
                {game.homePoints != null && game.awayPoints != null ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {game.homePoints}–{game.awayPoints}
                  </p>
                ) : null}
              </Link>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
