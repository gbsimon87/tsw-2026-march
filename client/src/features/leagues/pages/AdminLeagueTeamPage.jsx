import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LeagueMembersPanel } from '../components/LeagueMembersPanel';
import { JoinRequestsPanel } from '../components/JoinRequestsPanel';
import { LeagueRosterTable } from '../components/LeagueRosterTable';
import { leaguesApi } from '../api/leaguesApi';
import { Breadcrumbs } from '../../../components/Breadcrumbs';

export function AdminLeagueTeamPage() {
  const { leagueId, leagueTeamId } = useParams();
  const [team, setTeam] = useState(null);
  const [leagueName, setLeagueName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [playerJerseyNumber, setPlayerJerseyNumber] = useState('');
  const [managerEmail, setManagerEmail] = useState('');

  useEffect(() => {
    Promise.all([leaguesApi.getTeam(leagueId, leagueTeamId), leaguesApi.getById(leagueId)])
      .then(([teamResponse, leagueResponse]) => {
        setTeam(teamResponse.team);
        setLeagueName(leagueResponse.league?.name || '');
      })
      .catch((loadError) => setError(loadError.message || 'Failed to load league team'))
      .finally(() => setIsLoading(false));
  }, [leagueId, leagueTeamId]);

  async function refresh() {
    const response = await leaguesApi.getTeam(leagueId, leagueTeamId);
    setTeam(response.team);
  }

  async function addPlayer(event) {
    event.preventDefault();
    if (!playerName.trim()) {
      return;
    }
    const parsedJersey = Number(playerJerseyNumber);
    const jerseyNumber =
      playerJerseyNumber === '' || Number.isNaN(parsedJersey) ? undefined : parsedJersey;
    try {
      await leaguesApi.addPlayer(leagueId, leagueTeamId, {
        displayName: playerName.trim(),
        jerseyNumber,
      });
      setPlayerName('');
      setPlayerJerseyNumber('');
      await refresh();
    } catch (submitError) {
      setError(submitError.message || 'Failed to add player');
    }
  }

  async function addManager(event) {
    event.preventDefault();
    if (!managerEmail.trim()) {
      return;
    }
    try {
      await leaguesApi.addManager(leagueId, leagueTeamId, managerEmail.trim());
      setManagerEmail('');
      await refresh();
    } catch (submitError) {
      setError(submitError.message || 'Failed to add manager');
    }
  }

  async function approveJoin(requestId) {
    await leaguesApi.approveJoinRequest(leagueId, leagueTeamId, requestId);
    await refresh();
  }

  async function rejectJoin(requestId) {
    await leaguesApi.rejectJoinRequest(leagueId, leagueTeamId, requestId);
    await refresh();
  }

  async function removeMember(memberId) {
    await leaguesApi.removeMember(leagueId, leagueTeamId, memberId);
    await refresh();
  }

  if (isLoading) {
    return <p className="text-sm">Loading league team...</p>;
  }

  if (!team) {
    return <p className="text-sm text-red-600">{error || 'League team not found'}</p>;
  }

  return (
    <main className="space-y-8">
      <Breadcrumbs
        crumbs={[
          { label: 'Admin', href: '/admin' },
          { label: leagueName || 'League', href: `/admin/leagues/${leagueId}` },
          { label: team.name },
        ]}
      />

      <section className="rounded-3xl bg-gradient-to-r from-sky-50 via-white to-amber-50 p-8 md:p-10">
        <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">{team.name}</h1>
        <p className="mt-2 text-base text-slate-700">
          Team management, roster, join requests, and historical league context.
        </p>
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-slate-900">Roster</h2>
            <LeagueRosterTable roster={team.roster || []} />
          </section>
          <form
            onSubmit={addPlayer}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-xl font-semibold text-slate-900">Add Player</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <input
                type="text"
                className="min-w-[14rem] flex-1 rounded border border-slate-300 px-3 py-2"
                placeholder="Player name"
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
              />
              <input
                type="number"
                className="w-24 rounded border border-slate-300 px-3 py-2"
                placeholder="Jersey #"
                min="0"
                max="999"
                value={playerJerseyNumber}
                onChange={(event) => setPlayerJerseyNumber(event.target.value)}
              />
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Add Player
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-4">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-slate-900">Members</h2>
            <LeagueMembersPanel members={team.members || []} onRemove={removeMember} />
          </section>
          <form
            onSubmit={addManager}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-xl font-semibold text-slate-900">Assign Manager</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <input
                type="email"
                className="min-w-[14rem] flex-1 rounded border border-slate-300 px-3 py-2"
                placeholder="manager@email.com"
                value={managerEmail}
                onChange={(event) => setManagerEmail(event.target.value)}
              />
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Add Manager
              </button>
            </div>
          </form>
          <section>
            <h2 className="mb-3 text-xl font-semibold text-slate-900">Join Requests</h2>
            <JoinRequestsPanel
              requests={team.joinRequests || []}
              canReview
              onApprove={approveJoin}
              onReject={rejectJoin}
            />
          </section>
        </div>
      </section>
    </main>
  );
}
