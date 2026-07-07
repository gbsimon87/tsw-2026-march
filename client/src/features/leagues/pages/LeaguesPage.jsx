import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { leaguesApi } from '../api/leaguesApi';

export function LeaguesPage() {
  // OPT-014b: migrated from useEffect+useState to React Query.
  const {
    data,
    isLoading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: ['leagues'],
    queryFn: () => leaguesApi.list(),
  });

  const leagues = data?.leagues || [];
  const error = isError ? queryError?.message || 'Failed to load leagues' : '';

  return (
    <main className="space-y-8">
      <PageHeader
        title="Leagues"
        description="Organize teams, standings, rosters, and league games in one place."
      />

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
            to="/pricing"
            className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
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
                to={`/admin/leagues/${league.id}`}
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
