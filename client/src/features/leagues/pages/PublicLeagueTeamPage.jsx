import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { LeagueRosterTable } from '../components/LeagueRosterTable';
import { LeagueGameCard } from '../../../components/ui/LeagueGameCard';
import { leaguesApi } from '../api/leaguesApi';
import { getLeagueHeaderImage } from '../../feed/cardImage';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { PageHeader } from '../../../components/PageHeader';

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
    { label: 'Leagues' },
    { label: league.name, href: `/league/${league.slug}` },
    { label: team.name },
  ];

  return (
    <main className="space-y-8">
      <Breadcrumbs crumbs={breadcrumbs} />
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <img
              src={getLeagueHeaderImage(league)}
              alt={`${league.name} logo`}
              className="h-5 w-5 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
            />
            <span>{league.name}</span>
          </span>
        }
        title={team.name}
        description={`Standings position: ${team.standingsPosition || 'N/A'}`}
        media={
          <img
            src={team.logo?.url || teamPlaceholder}
            alt={`${team.name} logo`}
            className="h-16 w-16 rounded-full border border-slate-200 bg-white object-cover"
          />
        }
      />

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
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(team.games || []).length === 0 ? (
            <p className="text-sm text-slate-600">No league games yet.</p>
          ) : (
            (team.games || []).map((game) => <LeagueGameCard key={game.id} game={game} />)
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
