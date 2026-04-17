import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { leaguesApi } from '../api/leaguesApi';

export function LeaguesPage() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    leaguesApi
      .list()
      .then((response) => setLeagues(response.leagues || []))
      .catch((loadError) => setError(loadError.message || 'Failed to load leagues'))
      .finally(() => setIsLoading(false));
  }, []);

  const canCreateLeague = Boolean(user?.leagueEntitlements?.canCreateLeague);

  return (
    <main className="space-y-8">
      <section className="rounded-3xl bg-gradient-to-r from-sky-50 via-white to-amber-50 p-8 md:p-10">
        <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">Leagues</h1>
        <p className="mt-2 text-base text-slate-700">
          Organize teams, standings, rosters, and league games in one place.
        </p>
      </section>

      {!canCreateLeague ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-semibold text-slate-900">League premium required</h2>
          <p className="mt-2 text-sm text-slate-700">
            Your account can view league management surfaces, but creating a league requires the
            league premium entitlement.
          </p>
        </section>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section aria-labelledby="league-actions" className="space-y-3">
        <h2 id="league-actions" className="text-xl font-semibold text-slate-900">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/leagues/new"
            className={`rounded-xl px-4 py-3 text-sm font-semibold ${
              canCreateLeague
                ? 'bg-slate-900 text-white'
                : 'pointer-events-none border border-slate-200 bg-slate-100 text-slate-500'
            }`}
          >
            Create League
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">Your Leagues</h2>
        {isLoading ? <p className="mt-3 text-sm text-slate-600">Loading leagues...</p> : null}
        {!isLoading && leagues.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No leagues yet.</p>
        ) : null}
        {!isLoading && leagues.length > 0 ? (
          <div className="mt-4 grid gap-3">
            {leagues.map((league) => (
              <Link
                key={league.id}
                to={`/leagues/${league.id}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300"
              >
                <p className="font-semibold text-slate-900">{league.name}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {league.seasonLabel || 'Season TBD'} • {league.status}
                </p>
              </Link>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
