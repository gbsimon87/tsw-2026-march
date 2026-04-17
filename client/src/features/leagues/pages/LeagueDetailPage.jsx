import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { leaguesApi } from '../api/leaguesApi';
import { LeagueStandingsTable } from '../components/LeagueStandingsTable';

export function LeagueDetailPage() {
  const { leagueId } = useParams();
  const [league, setLeague] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [isSubmittingTeam, setIsSubmittingTeam] = useState(false);

  useEffect(() => {
    leaguesApi
      .getById(leagueId)
      .then((response) => setLeague(response.league))
      .catch((loadError) => setError(loadError.message || 'Failed to load league'))
      .finally(() => setIsLoading(false));
  }, [leagueId]);

  async function onCreateTeam(event) {
    event.preventDefault();
    if (!newTeamName.trim()) {
      return;
    }

    setIsSubmittingTeam(true);
    try {
      const response = await leaguesApi.createTeam(leagueId, { name: newTeamName.trim() });
      setLeague((current) =>
        current
          ? {
              ...current,
              teams: [...(current.teams || []), response.team],
            }
          : current
      );
      setNewTeamName('');
    } catch (submitError) {
      setError(submitError.message || 'Failed to add team');
    } finally {
      setIsSubmittingTeam(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm">Loading league...</p>;
  }

  if (!league) {
    return <p className="text-sm text-red-600">{error || 'League not found'}</p>;
  }

  return (
    <main className="space-y-8">
      <section className="rounded-3xl bg-gradient-to-r from-sky-50 via-white to-amber-50 p-8 md:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">{league.name}</h1>
            <p className="mt-2 text-base text-slate-700">
              {league.seasonLabel || 'Season TBD'} • {league.status}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              to={`/leagues/${league.id}/manage`}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800"
            >
              Manage League
            </Link>
            <Link
              to={`/leagues/${league.id}/games/new`}
              className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
            >
              Schedule League Game
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-slate-900">Teams</h2>
            </div>
            <div className="mt-4 grid gap-3">
              {(league.teams || []).map((team) => (
                <Link
                  key={team.id}
                  to={`/leagues/${league.id}/teams/${team.id}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300"
                >
                  <p className="font-semibold text-slate-900">{team.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{team.status}</p>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-semibold text-slate-900">Create Team</h2>
            <form onSubmit={onCreateTeam} className="mt-4 flex flex-wrap gap-3">
              <input
                type="text"
                className="min-w-[14rem] flex-1 rounded border border-slate-300 px-3 py-2"
                placeholder="Team name"
                value={newTeamName}
                onChange={(event) => setNewTeamName(event.target.value)}
              />
              <button
                type="submit"
                disabled={isSubmittingTeam}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                {isSubmittingTeam ? 'Adding...' : 'Add Team'}
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-slate-900">Standings</h2>
            <LeagueStandingsTable standings={league.standings || []} />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-xl font-semibold text-slate-900">League Games</h2>
            <div className="mt-4 space-y-3">
              {(league.games || []).map((game) => (
                <Link
                  key={game.id}
                  to={`/games/${game.id}`}
                  className="block rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300"
                >
                  <p className="font-semibold text-slate-900">{game.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {game.homeTeamName} vs {game.awayTeamName} • {game.status}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
