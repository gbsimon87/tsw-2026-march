import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CloudinaryImage } from '../../media/CloudinaryImage';

const TEAM_TABS = [
  {
    id: 'roster',
    label: 'Roster',
    icon: (
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M2 4h12M2 8h8M2 12h5" />
      </svg>
    ),
  },
  {
    id: 'members',
    label: 'Members',
    icon: (
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="6" cy="5" r="2.5" />
        <path d="M1 13c0-2.2 2.2-4 5-4s5 1.8 5 4" />
        <path d="M11 7c1.4 0 3 .9 3 3" />
        <circle cx="13" cy="4.5" r="1.8" />
      </svg>
    ),
  },
  {
    id: 'requests',
    label: 'Requests',
    icon: (
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="8" cy="6" r="3" />
        <path d="M8 9v4M6 11h4" />
      </svg>
    ),
  },
];
import { LeagueMembersPanel } from '../components/LeagueMembersPanel';
import { JoinRequestsPanel } from '../components/JoinRequestsPanel';
import { LeagueRosterTable } from '../components/LeagueRosterTable';
import { leaguesApi } from '../api/leaguesApi';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { PageHeader } from '../../../components/PageHeader';
import { SportsLoader } from '../../../components/SportsLoader';
import { ExportCsvButton } from '../../export/components/ExportCsvButton';
import { exportApi } from '../../export/api/exportApi';

export function AdminLeagueTeamPage() {
  const { leagueId, leagueTeamId } = useParams();
  const [team, setTeam] = useState(null);
  const [leagueName, setLeagueName] = useState('');
  const [seasonId, setSeasonId] = useState(null);
  const [viewerContext, setViewerContext] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('roster');
  const [teamNameInput, setTeamNameInput] = useState('');
  const [isEditingTeamName, setIsEditingTeamName] = useState(false);
  const [isUpdatingTeamName, setIsUpdatingTeamName] = useState(false);
  const teamNameInputRef = useRef(null);

  useEffect(() => {
    if (isEditingTeamName) {
      teamNameInputRef.current?.focus();
    }
  }, [isEditingTeamName]);
  const [playerName, setPlayerName] = useState('');
  const [playerJerseyNumber, setPlayerJerseyNumber] = useState('');
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState('');

  useEffect(() => {
    Promise.all([leaguesApi.getTeam(leagueId, leagueTeamId), leaguesApi.getById(leagueId)])
      .then(([teamResponse, leagueResponse]) => {
        setTeam(teamResponse.team);
        setLeagueName(leagueResponse.league?.name || '');
        setSeasonId(leagueResponse.league?.currentSeason?.id || null);
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

  async function updatePlayer(leaguePlayerId, payload) {
    try {
      const response = await leaguesApi.updatePlayer(
        leagueId,
        leagueTeamId,
        leaguePlayerId,
        payload
      );
      setTeam((current) => ({
        ...current,
        roster: (current.roster || []).map((player) =>
          player.id === leaguePlayerId ? response.player : player
        ),
      }));
    } catch (submitError) {
      setError(submitError.message || 'Failed to update player');
      throw submitError;
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
  const canEditRoster = canEditTeamName;

  const canSaveTeamName =
    !isUpdatingTeamName &&
    teamNameInput.trim() &&
    teamNameInput.trim() !== (team.name || '').trim();
  const rosterById = new Map((team.roster || []).map((player) => [String(player.id), player]));
  const joinRequests = (team.joinRequests || []).map((request) => {
    const requestedPlayer = request.requestedLeaguePlayerId
      ? rosterById.get(String(request.requestedLeaguePlayerId))
      : null;

    return {
      ...request,
      requestedPlayerName: requestedPlayer?.displayName || null,
      requestedPlayerJerseyNumber: requestedPlayer?.jerseyNumber ?? null,
    };
  });

  return (
    <main className="space-y-6">
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
                    ref={teamNameInputRef}
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
                <CloudinaryImage
                  src={team.logo.url}
                  alt={`${team.name} logo`}
                  width={64}
                  height={64}
                  loading="lazy"
                  decoding="async"
                  srcSetWidths={[64, 128, 256]}
                  sizes="64px"
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
        {canEditRoster && seasonId ? (
          <ExportCsvButton
            label="Export team CSV"
            fetcher={() => exportApi.getTeamCsv(leagueId, leagueTeamId, seasonId)}
          />
        ) : null}
      </PageHeader>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div
          className="grid border-b border-slate-200"
          style={{ gridTemplateColumns: `repeat(${TEAM_TABS.length}, minmax(0, 1fr))` }}
        >
          {TEAM_TABS.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-1 py-3 text-xs font-semibold transition ${
                index < TEAM_TABS.length - 1 ? 'border-r border-slate-200' : ''
              } ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 'roster' ? (
            <div className="space-y-5">
              <div>
                <h2 className="mb-3 text-lg font-semibold text-slate-900">Roster</h2>
                <LeagueRosterTable
                  roster={team.roster || []}
                  canEdit={canEditRoster}
                  onSavePlayer={updatePlayer}
                />
              </div>
              {canEditRoster ? (
                <form
                  onSubmit={addPlayer}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <h3 className="text-sm font-semibold text-slate-700">Add Player</h3>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <input
                      type="text"
                      autoComplete="off"
                      className="min-w-[14rem] flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Player name"
                      value={playerName}
                      onChange={(event) => setPlayerName(event.target.value)}
                    />
                    <input
                      autoComplete="off"
                      type="number"
                      className="w-24 rounded border border-slate-300 px-3 py-2 text-sm"
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
              ) : null}
            </div>
          ) : null}

          {activeTab === 'members' ? (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Members</h2>
              <LeagueMembersPanel members={team.members || []} onRemove={removeMember} />
            </div>
          ) : null}

          {activeTab === 'requests' ? (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Join Requests</h2>
              <JoinRequestsPanel
                requests={joinRequests}
                canReview
                onApprove={approveJoin}
                onReject={rejectJoin}
              />
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
