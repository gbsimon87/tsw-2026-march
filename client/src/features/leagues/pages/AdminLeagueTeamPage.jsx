import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LeagueMembersPanel } from '../components/LeagueMembersPanel';
import { JoinRequestsPanel } from '../components/JoinRequestsPanel';
import { LeagueRosterTable } from '../components/LeagueRosterTable';
import { leaguesApi } from '../api/leaguesApi';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { PageHeader } from '../../../components/PageHeader';
import { SportsLoader } from '../../../components/SportsLoader';

export function AdminLeagueTeamPage() {
  const { leagueId, leagueTeamId } = useParams();
  const [team, setTeam] = useState(null);
  const [leagueName, setLeagueName] = useState('');
  const [viewerContext, setViewerContext] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [teamNameInput, setTeamNameInput] = useState('');
  const [isEditingTeamName, setIsEditingTeamName] = useState(false);
  const [isUpdatingTeamName, setIsUpdatingTeamName] = useState(false);
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
        setViewerContext(leagueResponse.league?.viewerContext || null);
      })
      .catch((loadError) => setError(loadError.message || 'Failed to load league team'))
      .finally(() => setIsLoading(false));
  }, [leagueId, leagueTeamId]);

  useEffect(() => {
    setTeamNameInput(team?.name || '');
  }, [team?.name]);

  async function onUpdateTeamName() {
    if (isUpdatingTeamName) return;
    const nextName = teamNameInput.trim();
    if (!nextName || nextName === (team?.name || '').trim()) {
      setTeamNameInput(team?.name || '');
      setIsEditingTeamName(false);
      return;
    }
    setIsUpdatingTeamName(true);
    try {
      const response = await leaguesApi.updateTeam(leagueId, leagueTeamId, { name: nextName });
      setTeam(response.team);
      setIsEditingTeamName(false);
    } catch (submitError) {
      setError(submitError.message || 'Failed to update team name');
    } finally {
      setIsUpdatingTeamName(false);
    }
  }

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
    return <SportsLoader label="Loading league team" fullPage />;
  }

  if (!team) {
    return <p className="text-sm text-red-600">{error || 'League team not found'}</p>;
  }

  const canEditTeamName =
    viewerContext?.viewerRole === 'owner' ||
    viewerContext?.viewerRole === 'league_manager' ||
    (viewerContext?.viewerRole === 'team_manager' &&
      viewerContext?.managedTeamIds?.includes(leagueTeamId));

  const canSaveTeamName =
    !isUpdatingTeamName &&
    teamNameInput.trim() &&
    teamNameInput.trim() !== (team.name || '').trim();

  return (
    <main className="space-y-8">
      <Breadcrumbs
        crumbs={[
          { label: 'Admin', href: '/admin' },
          { label: leagueName || 'League', href: `/admin/leagues/${leagueId}` },
          { label: team.name },
        ]}
      />

      <PageHeader
        title={
          canEditTeamName ? (
            <span className="inline-flex max-w-full flex-wrap items-center gap-2">
              {isEditingTeamName ? (
                <>
                  <input
                    autoComplete="off"
                    type="text"
                    required
                    maxLength={120}
                    aria-label="Team Name"
                    className="min-w-0 rounded-lg border border-slate-300 px-2 py-1 text-2xl font-bold leading-tight text-slate-900 md:text-3xl"
                    value={teamNameInput}
                    disabled={isUpdatingTeamName}
                    onChange={(event) => setTeamNameInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        onUpdateTeamName();
                      }
                      if (event.key === 'Escape') {
                        setTeamNameInput(team.name || '');
                        setIsEditingTeamName(false);
                      }
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    aria-label="Save team name"
                    disabled={!canSaveTeamName}
                    onClick={onUpdateTeamName}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isUpdatingTeamName ? (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4 animate-spin"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M5 13.5 9 17l10-10" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel team name edit"
                    disabled={isUpdatingTeamName}
                    onClick={() => {
                      setTeamNameInput(team.name || '');
                      setIsEditingTeamName(false);
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <span>{team.name}</span>
                  <button
                    type="button"
                    aria-label="Edit team name"
                    onClick={() => setIsEditingTeamName(true)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                </>
              )}
            </span>
          ) : (
            team.name
          )
        }
        titleAriaLabel="team-name"
        description="Team management, roster, join requests, and historical league context."
        media={
          <label className="group relative block cursor-pointer">
            <input
              label="team-logo"
              aria-label="team-logo"
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
        }
      >
        {logoError ? <p className="text-xs text-red-600">{logoError}</p> : null}
      </PageHeader>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
                autoComplete="off"
                className="min-w-[14rem] flex-1 rounded border border-slate-300 px-3 py-2"
                placeholder="Player name"
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
              />
              <input
                autoComplete="off"
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
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
                autoComplete="off"
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
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
