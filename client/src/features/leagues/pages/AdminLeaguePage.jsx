import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { leaguesApi } from '../api/leaguesApi';
import { LeagueStandingsTable } from '../components/LeagueStandingsTable';
import { JoinRequestsPanel } from '../components/JoinRequestsPanel';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { PageHeader } from '../../../components/PageHeader';
import { SportsLoader } from '../../../components/SportsLoader';
import { useAuth } from '../../../app/store/AuthContext';
import { gamesApi } from '../../games/api/gamesApi';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';

const TABS = [
  {
    id: 'games',
    label: 'Games',
    icon: (
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M2 12h12M5 12V6M8 12V3M11 12V8" />
      </svg>
    ),
  },
  {
    id: 'teams',
    label: 'Teams',
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
    id: 'management',
    label: 'Managers',
    icon: (
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M8 1l1.5 3 3.5.5-2.5 2.5.5 3.5L8 9l-3 1.5.5-3.5L3 4.5 6.5 4z" />
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
        <circle cx="8" cy="5" r="2.5" />
        <path d="M3 13c0-2.2 2.2-4 5-4s5 1.8 5 4" />
        <path d="M11 8h4M13 6v4" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="8" cy="8" r="2" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4" />
      </svg>
    ),
  },
];

function getLeagueRoleLabel(viewerRole) {
  if (viewerRole === 'owner') return 'League Owner';
  if (viewerRole === 'league_manager') return 'League Admin';
  if (viewerRole === 'team_manager') return 'Team Manager';
  if (viewerRole === 'player') return 'Player';
  if (viewerRole === 'helper') return 'Helper';
  return 'Member';
}

export function AdminLeaguePage() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [league, setLeague] = useState(null);
  const [copiedGameId, setCopiedGameId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('games');
  const [leagueNameInput, setLeagueNameInput] = useState('');
  const [isEditingLeagueName, setIsEditingLeagueName] = useState(false);
  const [isUpdatingLeague, setIsUpdatingLeague] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [leagueManagers, setLeagueManagers] = useState([]);
  const [newManagerEmail, setNewManagerEmail] = useState('');
  const [isSubmittingManager, setIsSubmittingManager] = useState(false);
  const [managerError, setManagerError] = useState('');
  const [deletingGameId, setDeletingGameId] = useState('');
  const [confirmDeleteGameId, setConfirmDeleteGameId] = useState('');
  const [teamManagerEmails, setTeamManagerEmails] = useState({});
  const [submittingTeamManagerId, setSubmittingTeamManagerId] = useState('');
  const [teamRequests, setTeamRequests] = useState({});
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);

  const isOwner = user && league && String(league.ownerUserId) === String(user.id);
  const canEditLeague =
    league?.viewerContext?.viewerRole === 'owner' ||
    league?.viewerContext?.viewerRole === 'league_manager' ||
    isOwner;

  const canViewManagers = canEditLeague || league?.viewerContext?.viewerRole === 'team_manager';

  function canTrackGame(game) {
    const ctx = league?.viewerContext;
    if (!ctx) return false;
    if (ctx.viewerRole === 'owner' || ctx.viewerRole === 'league_manager') return true;
    if (ctx.viewerRole === 'team_manager') {
      return (
        ctx.managedTeamIds.includes(game.homeLeagueTeamId) ||
        ctx.managedTeamIds.includes(game.awayLeagueTeamId)
      );
    }
    return false;
  }

  useEffect(() => {
    leaguesApi
      .getById(leagueId)
      .then((response) => setLeague(response.league))
      .catch((loadError) => setError(loadError.message || 'Failed to load league'))
      .finally(() => setIsLoading(false));
  }, [leagueId]);

  useEffect(() => {
    if (!canViewManagers) return;
    leaguesApi
      .listLeagueManagers(leagueId)
      .then((response) => setLeagueManagers(response.managers))
      .catch(() => {});
  }, [leagueId, canViewManagers]);

  useEffect(() => {
    setLeagueNameInput(league?.name || '');
  }, [league?.name]);

  useEffect(() => {
    if (activeTab !== 'requests' || !league?.teams?.length) return;
    setIsLoadingRequests(true);
    Promise.all(
      (league.teams || []).map((team) =>
        leaguesApi
          .getTeam(leagueId, team.id)
          .then((res) => ({ teamId: team.id, teamName: team.name, data: res.team }))
      )
    )
      .then((results) => {
        const map = {};
        for (const { teamId, teamName, data } of results) {
          const rosterById = new Map((data.roster || []).map((p) => [String(p.id), p]));
          map[teamId] = {
            teamName,
            requests: (data.joinRequests || []).map((req) => {
              const requestedPlayer = req.requestedLeaguePlayerId
                ? rosterById.get(String(req.requestedLeaguePlayerId))
                : null;
              return {
                ...req,
                requestedPlayerName: requestedPlayer?.displayName || null,
                requestedPlayerJerseyNumber: requestedPlayer?.jerseyNumber ?? null,
              };
            }),
          };
        }
        setTeamRequests(map);
      })
      .catch(() => {})
      .finally(() => setIsLoadingRequests(false));
  }, [activeTab, leagueId, league?.teams]);

  async function onApproveJoin(teamId, requestId) {
    await leaguesApi.approveJoinRequest(leagueId, teamId, requestId);
    const res = await leaguesApi.getTeam(leagueId, teamId);
    const rosterById = new Map((res.team.roster || []).map((p) => [String(p.id), p]));
    setTeamRequests((current) => ({
      ...current,
      [teamId]: {
        ...current[teamId],
        requests: (res.team.joinRequests || []).map((req) => {
          const requestedPlayer = req.requestedLeaguePlayerId
            ? rosterById.get(String(req.requestedLeaguePlayerId))
            : null;
          return {
            ...req,
            requestedPlayerName: requestedPlayer?.displayName || null,
            requestedPlayerJerseyNumber: requestedPlayer?.jerseyNumber ?? null,
          };
        }),
      },
    }));
  }

  async function onRejectJoin(teamId, requestId) {
    await leaguesApi.rejectJoinRequest(leagueId, teamId, requestId);
    setTeamRequests((current) => ({
      ...current,
      [teamId]: {
        ...current[teamId],
        requests: (current[teamId]?.requests || []).filter((r) => r.id !== requestId),
      },
    }));
  }

  async function onAddLeagueManager(event) {
    event.preventDefault();
    if (!newManagerEmail.trim()) return;
    setManagerError('');
    setIsSubmittingManager(true);
    try {
      const response = await leaguesApi.addLeagueManager(leagueId, newManagerEmail.trim());
      setLeagueManagers((current) => [...current, response.manager]);
      setNewManagerEmail('');
    } catch (submitError) {
      setManagerError(submitError.message || 'Failed to add league manager');
    } finally {
      setIsSubmittingManager(false);
    }
  }

  async function onDeleteGame(gameId) {
    setConfirmDeleteGameId('');
    setDeletingGameId(gameId);
    try {
      await gamesApi.deleteGame(gameId);
      setLeague((current) =>
        current
          ? { ...current, games: (current.games || []).filter((g) => g.id !== gameId) }
          : current
      );
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to remove game');
    } finally {
      setDeletingGameId('');
    }
  }

  async function onRemoveLeagueManager(managerId) {
    setManagerError('');
    try {
      await leaguesApi.removeLeagueManager(leagueId, managerId);
      setLeagueManagers((current) => current.filter((m) => m.id !== managerId));
    } catch (submitError) {
      setManagerError(submitError.message || 'Failed to remove league manager');
    }
  }

  async function onAddTeamManager(event, teamId) {
    event.preventDefault();
    const email = (teamManagerEmails[teamId] || '').trim();
    if (!email) return;
    setManagerError('');
    setSubmittingTeamManagerId(teamId);
    try {
      await leaguesApi.addManager(leagueId, teamId, email);
      setTeamManagerEmails((current) => ({ ...current, [teamId]: '' }));
      const response = await leaguesApi.getById(leagueId);
      setLeague(response.league);
    } catch (submitError) {
      setManagerError(submitError.message || 'Failed to add team manager');
    } finally {
      setSubmittingTeamManagerId('');
    }
  }

  async function onRemoveTeamManager(teamId, memberId) {
    setManagerError('');
    try {
      await leaguesApi.removeMember(leagueId, teamId, memberId);
      setLeague((current) => {
        if (!current) return current;
        return {
          ...current,
          teams: (current.teams || []).map((t) =>
            t.id === teamId
              ? { ...t, members: (t.members || []).filter((m) => m.id !== memberId) }
              : t
          ),
        };
      });
    } catch (submitError) {
      setManagerError(submitError.message || 'Failed to remove team manager');
    }
  }

  async function onTogglePublicVisibility() {
    if (!league || isUpdatingLeague) {
      return;
    }

    setError('');
    setIsUpdatingLeague(true);
    try {
      const response = await leaguesApi.update(league.id, {
        isPublic: !league.isPublic,
      });
      setLeague(response.league);
    } catch (submitError) {
      setError(submitError.message || 'Failed to update league visibility');
    } finally {
      setIsUpdatingLeague(false);
    }
  }

  async function onUpdateLeagueName() {
    if (!league || isUpdatingLeague) {
      return;
    }

    const nextName = leagueNameInput.trim();
    if (!nextName || nextName === (league.name || '').trim()) {
      setLeagueNameInput(league.name || '');
      setIsEditingLeagueName(false);
      return;
    }

    setError('');
    setIsUpdatingLeague(true);
    try {
      const response = await leaguesApi.update(league.id, { name: nextName });
      setLeague(response.league);
      setIsEditingLeagueName(false);
    } catch (submitError) {
      setError(submitError.message || 'Failed to update league name');
    } finally {
      setIsUpdatingLeague(false);
    }
  }

  async function copyShareUrl(gameId) {
    if (!gameId || !navigator?.clipboard?.writeText) {
      return;
    }
    const shareUrl = `${window.location.origin}/games/${gameId}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopiedGameId(gameId);
    window.setTimeout(() => {
      setCopiedGameId((current) => (current === gameId ? '' : current));
    }, 1500);
  }

  if (isLoading) {
    return <SportsLoader label="Loading league" fullPage />;
  }

  if (!league) {
    return <p className="text-sm text-red-600">{error || 'League not found'}</p>;
  }

  const leagueName = league.name?.trim();
  const displayedLeagueName = leagueName || 'Unnamed league';
  const canSaveLeagueName =
    !isUpdatingLeague &&
    leagueNameInput.trim() &&
    leagueNameInput.trim() !== (league.name || '').trim();
  const viewerRoleLabel = getLeagueRoleLabel(league.viewerContext?.viewerRole);

  const breadcrumbs = [{ label: 'Admin', href: '/admin' }, { label: league.name }];

  return (
    <main className="space-y-6">
      <Breadcrumbs crumbs={breadcrumbs} />

      <PageHeader
        title={
          canEditLeague ? (
            <span className="inline-flex max-w-full flex-wrap items-center gap-2">
              {isEditingLeagueName ? (
                <>
                  <input
                    autoComplete="off"
                    type="text"
                    required
                    maxLength={120}
                    aria-label="League Name"
                    className="min-w-0 rounded-lg border border-slate-300 px-2 py-1 text-2xl font-bold leading-tight text-slate-900 md:text-3xl"
                    value={leagueNameInput}
                    disabled={isUpdatingLeague}
                    onChange={(event) => setLeagueNameInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        onUpdateLeagueName();
                      }
                      if (event.key === 'Escape') {
                        setLeagueNameInput(league.name || '');
                        setIsEditingLeagueName(false);
                      }
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    aria-label="Save league name"
                    disabled={!canSaveLeagueName}
                    onClick={onUpdateLeagueName}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isUpdatingLeague ? (
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
                    aria-label="Cancel league name edit"
                    disabled={isUpdatingLeague}
                    onClick={() => {
                      setLeagueNameInput(league.name || '');
                      setIsEditingLeagueName(false);
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
                  <span>{displayedLeagueName}</span>
                  <button
                    type="button"
                    aria-label="Edit league name"
                    onClick={() => setIsEditingLeagueName(true)}
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
            displayedLeagueName
          )
        }
        titleAriaLabel="League Name"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>{league.seasonLabel || 'Season TBD'}</span>
            <span className="text-slate-300">•</span>
            <span>{league.status}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
              {viewerRoleLabel}
            </span>
          </span>
        }
        media={
          <label className="group relative block cursor-pointer">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label="Upload league logo"
              disabled={isUploadingLogo}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setLogoError('');
                setIsUploadingLogo(true);
                try {
                  const formData = new FormData();
                  formData.append('logo', file);
                  const response = await leaguesApi.uploadLogo(leagueId, formData);
                  setLeague((current) => ({ ...current, logo: response.league.logo }));
                } catch (uploadError) {
                  setLogoError(uploadError.message || 'Failed to upload logo');
                } finally {
                  setIsUploadingLogo(false);
                }
                event.target.value = '';
              }}
            />
            {league.logo?.url ? (
              <>
                <img
                  src={league.logo.url}
                  alt={`${league.name} logo`}
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

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div
          className="grid border-b border-slate-200"
          style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}
        >
          {TABS.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-1 py-3 text-xs font-semibold transition ${
                index < TABS.length - 1 ? 'border-r border-slate-200' : ''
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
          {activeTab === 'games' ? (
            <div>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">League Games</h2>
                <Link
                  to={`/admin/leagues/${league.id}/games/new`}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white text-center"
                >
                  Schedule Game
                </Link>
              </div>
              {(league.games || []).length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">No league games yet.</p>
              ) : (
                <div className="mt-3 divide-y divide-slate-100">
                  {(league.games || []).map((game) => {
                    const gameId = game.id || game._id;
                    const canNavigate = Boolean(gameId);
                    const scoreLabel =
                      game.homePoints != null && game.awayPoints != null
                        ? `${game.homePoints}–${game.awayPoints}`
                        : null;

                    return (
                      <article
                        key={gameId || game.title}
                        className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex shrink-0 items-center">
                            <img
                              src={game.homeTeamLogoUrl || teamPlaceholder}
                              alt=""
                              className="h-8 w-8 rounded-full border border-slate-200 bg-white object-cover"
                            />
                            <img
                              src={game.awayTeamLogoUrl || teamPlaceholder}
                              alt=""
                              className="-ml-2 h-8 w-8 rounded-full border border-slate-200 bg-white object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-slate-900">
                              {scoreLabel ? (
                                <>
                                  <span className="font-semibold">{game.homeTeamName}</span>
                                  {` ${game.homePoints} – ${game.awayPoints} `}
                                  <span className="font-semibold">{game.awayTeamName}</span>
                                </>
                              ) : (
                                <>
                                  <span className="font-semibold">{game.homeTeamName}</span>
                                  {' vs '}
                                  <span className="font-semibold">{game.awayTeamName}</span>
                                </>
                              )}
                            </p>
                            <p className="mt-0.5 text-sm text-slate-500">{game.status}</p>
                          </div>
                        </div>
                        <div className="flex w-full items-center gap-2 sm:w-auto">
                          {canTrackGame(game) ? (
                            <button
                              type="button"
                              aria-label={`Remove ${game.title}`}
                              disabled={!canNavigate || deletingGameId === gameId}
                              className="rounded-md border border-rose-200 p-2 text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => {
                                if (gameId) setConfirmDeleteGameId(gameId);
                              }}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                              </svg>
                            </button>
                          ) : null}
                          <div className="ml-auto flex items-center gap-2">
                            <button
                              type="button"
                              aria-label={`Copy share link for ${game.title}`}
                              disabled={!canNavigate}
                              className="rounded-md border border-slate-300 p-2 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => {
                                if (gameId) copyShareUrl(gameId);
                              }}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                {copiedGameId === gameId ? (
                                  <path d="M5 13.5 9 17l10-10" />
                                ) : (
                                  <>
                                    <rect x="9" y="9" width="10" height="10" rx="2" />
                                    <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                                  </>
                                )}
                              </svg>
                            </button>
                            <button
                              type="button"
                              aria-label={`Track ${game.title}`}
                              disabled={!canNavigate || !canTrackGame(game)}
                              className="rounded-md border border-slate-300 p-2 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => {
                                if (gameId) navigate(`/games/${gameId}/track`);
                              }}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M4 19h16" />
                                <path d="M7 16V8" />
                                <path d="M12 16V5" />
                                <path d="M17 16v-4" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === 'teams' ? (
            <div>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">League Teams</h2>
                <Link
                  to={`/admin/leagues/${league.id}/teams/new`}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white text-center"
                >
                  Add Team
                </Link>
              </div>
              <LeagueStandingsTable
                standings={league.standings || []}
                getTeamHref={(row) => `/admin/leagues/${league.id}/teams/${row.teamId}`}
                getTeamLogo={(row) => {
                  const team = (league.teams || []).find(
                    (t) => String(t.id) === String(row.teamId)
                  );
                  return team?.logo?.url ?? null;
                }}
                className="mt-4"
              />
            </div>
          ) : null}

          {activeTab === 'management' ? (
            canViewManagers ? (
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Managers</h2>
                <p className="mt-1 text-sm text-slate-600">
                  League managers can manage all teams and games but cannot delete the league.
                </p>
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                    League Managers
                  </h3>
                  {leagueManagers.length > 0 ? (
                    <div className="mt-3 divide-y divide-slate-200">
                      {leagueManagers.map((manager) => (
                        <article key={manager.id} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="font-medium text-slate-900">
                                {manager.userName || manager.userEmail || 'Unknown'}
                              </span>
                              {manager.userEmail ? (
                                <span className="ml-2 text-sm text-slate-400">
                                  • {manager.userEmail}
                                </span>
                              ) : null}
                            </div>
                            {isOwner ? (
                              <button
                                type="button"
                                onClick={() => onRemoveLeagueManager(manager.id)}
                                className="shrink-0 rounded-lg border border-red-200 px-2 py-0.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">No league managers yet.</p>
                  )}
                  {isOwner ? (
                    <form onSubmit={onAddLeagueManager} className="mt-3 flex gap-2">
                      <input
                        autoComplete="off"
                        type="email"
                        className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
                        placeholder="Add manager by email"
                        value={newManagerEmail}
                        onChange={(event) => setNewManagerEmail(event.target.value)}
                      />
                      <button
                        aria-label="manager-submit"
                        type="submit"
                        disabled={isSubmittingManager}
                        className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {isSubmittingManager ? 'Adding…' : 'Add'}
                      </button>
                    </form>
                  ) : null}
                </div>
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                    Team Managers
                  </h3>
                  {(league.teams || []).length > 0 ? (
                    <div className="mt-3 divide-y divide-slate-200">
                      {(league.teams || []).map((team) => {
                        const teamManagers = (team.members || []).filter(
                          (member) => member.role === 'manager'
                        );
                        const isSubmitting = submittingTeamManagerId === team.id;
                        return (
                          <article key={team.id} className="py-4 first:pt-0 last:pb-0">
                            <Link
                              to={`/admin/leagues/${league.id}/teams/${team.id}`}
                              className="font-medium text-slate-900 transition hover:text-sky-700 hover:underline"
                            >
                              {team.name}
                            </Link>
                            {teamManagers.length > 0 ? (
                              <ul className="mt-2 space-y-1">
                                {teamManagers.map((manager) => (
                                  <li
                                    key={manager.id}
                                    className="flex items-center gap-2 text-sm text-slate-600"
                                  >
                                    <span className="font-medium text-slate-800">
                                      {manager.userName || manager.userEmail || 'Unknown'}
                                    </span>
                                    {manager.userEmail ? (
                                      <span className="text-slate-400">• {manager.userEmail}</span>
                                    ) : null}
                                    {canEditLeague ? (
                                      <button
                                        type="button"
                                        onClick={() => onRemoveTeamManager(team.id, manager.id)}
                                        className="ml-auto shrink-0 rounded-lg border border-red-200 px-2 py-0.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                                      >
                                        Remove
                                      </button>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-1 text-sm text-slate-400">No managers assigned</p>
                            )}
                            {canEditLeague ? (
                              <form
                                onSubmit={(e) => onAddTeamManager(e, team.id)}
                                className="mt-3 flex gap-2"
                              >
                                <input
                                  autoComplete="off"
                                  type="email"
                                  className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm"
                                  placeholder="Add manager by email"
                                  value={teamManagerEmails[team.id] || ''}
                                  onChange={(e) =>
                                    setTeamManagerEmails((current) => ({
                                      ...current,
                                      [team.id]: e.target.value,
                                    }))
                                  }
                                />
                                <button
                                  type="submit"
                                  disabled={isSubmitting}
                                  className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                >
                                  {isSubmitting ? 'Adding…' : 'Add'}
                                </button>
                              </form>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">No teams yet.</p>
                  )}
                </div>
                {managerError ? (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                    {managerError}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                You don&apos;t have access to manager settings.
              </p>
            )
          ) : null}

          {activeTab === 'requests' ? (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Join Requests</h2>
              <p className="mt-1 text-sm text-slate-600">
                Pending requests from players and team managers across all league teams.
              </p>
              {isLoadingRequests ? (
                <p className="mt-4 text-sm text-slate-500">Loading requests…</p>
              ) : Object.keys(teamRequests).length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No pending requests.</p>
              ) : (
                <div className="mt-4 space-y-5">
                  {Object.entries(teamRequests).map(([teamId, { teamName, requests }]) =>
                    requests.length === 0 ? null : (
                      <div
                        key={teamId}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
                          {teamName}
                        </h3>
                        <JoinRequestsPanel
                          requests={requests}
                          onApprove={(requestId) => onApproveJoin(teamId, requestId)}
                          onReject={(requestId) => onRejectJoin(teamId, requestId)}
                        />
                      </div>
                    )
                  )}
                  {Object.values(teamRequests).every((t) => t.requests.length === 0) ? (
                    <p className="text-sm text-slate-500">No pending requests.</p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === 'settings' ? (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Public Visibility</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Control whether this league appears in public discovery and public league pages.
                  </p>
                </div>
                <button
                  aria-label="league-update"
                  type="button"
                  disabled={isUpdatingLeague}
                  onClick={onTogglePublicVisibility}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${
                    league.isPublic ? 'bg-rose-600' : 'bg-emerald-600'
                  }`}
                >
                  {isUpdatingLeague
                    ? 'Saving...'
                    : league.isPublic
                      ? 'Hide From Public'
                      : 'Make Public'}
                </button>
              </div>
              <p className="mt-3 text-sm text-slate-700">
                Current visibility:{' '}
                <span className="font-semibold">{league.isPublic ? 'Public' : 'Private'}</span>
              </p>
            </div>
          ) : null}
        </div>
      </div>
      {confirmDeleteGameId ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[1px]"
          onClick={() => setConfirmDeleteGameId('')}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-semibold text-slate-900">Remove this game?</p>
            <p className="mt-1 text-sm text-slate-500">
              This will permanently delete the game and all its recorded stats. This cannot be
              undone.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteGameId('')}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingGameId === confirmDeleteGameId}
                onClick={() => onDeleteGame(confirmDeleteGameId)}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60"
              >
                {deletingGameId === confirmDeleteGameId ? 'Removing…' : 'Yes, remove game'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
