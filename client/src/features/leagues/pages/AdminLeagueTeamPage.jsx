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
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState('');

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
        <div className="flex items-center gap-5">
          <label className="group relative shrink-0 cursor-pointer">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={isUploadingLogo}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setLogoError('');
                setIsUploadingLogo(true);
                try {
                  const formData = new FormData();
                  formData.append('logo', file);
                  const response = await leaguesApi.uploadTeamLogo(
                    leagueId,
                    leagueTeamId,
                    formData
                  );
                  setTeam((current) => ({ ...current, logo: response.team.logo }));
                } catch (uploadError) {
                  setLogoError(uploadError.message || 'Failed to upload logo');
                } finally {
                  setIsUploadingLogo(false);
                }
                event.target.value = '';
              }}
            />
            {team.logo?.url ? (
              <>
                <img
                  src={team.logo.url}
                  alt={`${team.name} logo`}
                  className="h-16 w-16 rounded-full border border-slate-200 bg-white object-cover transition group-hover:opacity-60"
                />
                <span className="pointer-events-none absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm transition group-hover:bg-slate-100">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 text-slate-600"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </span>
              </>
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-white text-slate-400 transition group-hover:border-slate-400 group-hover:text-slate-600">
                {isUploadingLogo ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6 animate-spin"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                )}
              </span>
            )}
          </label>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">{team.name}</h1>
            <p className="mt-2 text-base text-slate-700">
              Team management, roster, join requests, and historical league context.
            </p>
            {logoError ? <p className="mt-1 text-xs text-red-600">{logoError}</p> : null}
          </div>
        </div>
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
