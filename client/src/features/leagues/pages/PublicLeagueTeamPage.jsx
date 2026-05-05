import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { LeagueRosterTable } from '../components/LeagueRosterTable';
import { leaguesApi } from '../api/leaguesApi';
import { getLeagueHeaderImage } from '../../feed/cardImage';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import { Breadcrumbs } from '../../../components/Breadcrumbs';

export function PublicLeagueTeamPage() {
  const { leagueSlug, teamSlug } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestRole, setRequestRole] = useState('helper');
  const [requestedLeaguePlayerId, setRequestedLeaguePlayerId] = useState('');
  const [requestStatus, setRequestStatus] = useState('');

  useEffect(() => {
    leaguesApi
      .getPublicTeam(leagueSlug, teamSlug)
      .then(setData)
      .catch((loadError) => setError(loadError.message || 'Failed to load team'))
      .finally(() => setIsLoading(false));
  }, [leagueSlug, teamSlug]);

  if (isLoading) {
    return <p className="text-sm">Loading league team...</p>;
  }

  if (!data?.team) {
    return <p className="text-sm text-red-600">{error || 'League team not found'}</p>;
  }

  const { league, team } = data;
  const joinablePlayers = (team.roster || []).filter(
    (player) => !player.isClaimed && player.isActive
  );

  async function submitJoinRequest(event) {
    event.preventDefault();
    setError('');
    setRequestStatus('');

    try {
      await leaguesApi.createJoinRequest(league.id, team.id, {
        requestedRole: requestRole,
        ...(requestRole === 'player' ? { requestedLeaguePlayerId } : {}),
      });
      setRequestStatus('Join request submitted.');
    } catch (submitError) {
      setError(submitError.message || 'Failed to submit join request');
    }
  }

  const breadcrumbs = [
    { label: 'Leagues', href: '/leagues' },
    { label: league.name, href: `/league/${league.slug}` },
    { label: team.name },
  ];

  return (
    <main className="space-y-8">
      <Breadcrumbs crumbs={breadcrumbs} />
      <section className="rounded-3xl bg-gradient-to-r from-sky-50 via-white to-amber-50 p-8 md:p-10">
        <div className="flex items-center gap-2">
          <img
            src={getLeagueHeaderImage(league)}
            alt={`${league.name} logo`}
            className="h-5 w-5 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
          />
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            {league.name}
          </p>
        </div>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">{team.name}</h1>
        <p className="mt-2 text-base text-slate-700">
          Standings position: {team.standingsPosition || 'N/A'}
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">Player Stats</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Player</th>
                <th className="px-3 py-2 text-right">PTS</th>
                <th className="px-3 py-2 text-right">REB</th>
                <th className="px-3 py-2 text-right">AST</th>
                <th className="px-3 py-2 text-right">STL</th>
                <th className="px-3 py-2 text-right">TOV</th>
              </tr>
            </thead>
            <tbody>
              {(team.stats || []).map((row) => (
                <tr key={row.playerId} className="border-t border-slate-200">
                  <td className="px-3 py-2 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <img
                        src={playerPlaceholder}
                        alt=""
                        className="h-6 w-6 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                      />
                      <Link
                        to={`/league/${league.slug}/teams/${team.slug}/players/${row.playerId}`}
                        className="underline decoration-slate-300 underline-offset-4 transition hover:text-sky-700 hover:decoration-sky-500"
                      >
                        {row.displayName}
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">{row.points}</td>
                  <td className="px-3 py-2 text-right">{row.reb}</td>
                  <td className="px-3 py-2 text-right">{row.ast}</td>
                  <td className="px-3 py-2 text-right">{row.stl}</td>
                  <td className="px-3 py-2 text-right">{row.tov}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">League Games</h2>
        <div className="mt-4 grid gap-3">
          {(team.games || []).length === 0 ? (
            <p className="text-sm text-slate-600">No league games yet.</p>
          ) : (
            (team.games || []).map((game) => (
              <Link
                key={game.id}
                to={`/games/${game.id}`}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300"
              >
                <img
                  src={game.homeTeamLogoUrl || teamPlaceholder}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                />
                <div className="min-w-0 flex-1 text-center">
                  <p className="font-semibold text-slate-900">
                    {game.homeTeamName || 'Unknown Team'} vs {game.awayTeamName || 'Unknown Team'}
                  </p>
                  {game.homePoints != null && game.awayPoints != null ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {game.homePoints}–{game.awayPoints}
                    </p>
                  ) : null}
                </div>
                <img
                  src={game.awayTeamLogoUrl || teamPlaceholder}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                />
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">Roster</h2>
        <LeagueRosterTable
          bare
          roster={team.roster || []}
          getPlayerHref={(player) =>
            `/league/${league.slug}/teams/${team.slug}/players/${player.id}`
          }
        />
      </section>

      {user ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-semibold text-slate-900">Request to Join</h2>
          <p className="mt-2 text-sm text-slate-600">
            Join as a helper or claim an existing roster slot. Requests are reviewed manually by the
            league owner or this team’s managers.
          </p>
          <form onSubmit={submitJoinRequest} className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm text-slate-700">Role</span>
              <select
                className="w-full rounded border border-slate-300 px-3 py-2"
                value={requestRole}
                onChange={(event) => setRequestRole(event.target.value)}
              >
                <option value="helper">Helper</option>
                <option value="player">Player</option>
              </select>
            </label>
            {requestRole === 'player' ? (
              <label className="block">
                <span className="mb-1 block text-sm text-slate-700">Claim roster slot</span>
                <select
                  required
                  className="w-full rounded border border-slate-300 px-3 py-2"
                  value={requestedLeaguePlayerId}
                  onChange={(event) => setRequestedLeaguePlayerId(event.target.value)}
                >
                  <option value="">Select open player slot</option>
                  {joinablePlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.displayName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white"
            >
              Submit Join Request
            </button>
            {requestStatus ? <p className="text-sm text-emerald-700">{requestStatus}</p> : null}
          </form>
        </section>
      ) : null}
    </main>
  );
}
