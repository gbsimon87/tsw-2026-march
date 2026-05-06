import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { leaguesApi } from '../api/leaguesApi';
import { LeagueStandingsTable } from '../components/LeagueStandingsTable';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { PageHeader } from '../../../components/PageHeader';
import { useAuth } from '../../../app/store/AuthContext';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';

export function AdminLeaguePage() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [league, setLeague] = useState(null);
  const [copiedGameId, setCopiedGameId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [isSubmittingTeam, setIsSubmittingTeam] = useState(false);
  const [isUpdatingLeague, setIsUpdatingLeague] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [leagueManagers, setLeagueManagers] = useState([]);
  const [newManagerEmail, setNewManagerEmail] = useState('');
  const [isSubmittingManager, setIsSubmittingManager] = useState(false);
  const [managerError, setManagerError] = useState('');

  const isOwner = user && league && String(league.ownerUserId) === String(user.id);

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
    if (!isOwner) return;
    leaguesApi
      .listLeagueManagers(leagueId)
      .then((response) => setLeagueManagers(response.managers))
      .catch(() => {});
  }, [leagueId, isOwner]);

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

  async function onRemoveLeagueManager(managerId) {
    setManagerError('');
    try {
      await leaguesApi.removeLeagueManager(leagueId, managerId);
      setLeagueManagers((current) => current.filter((m) => m.id !== managerId));
    } catch (submitError) {
      setManagerError(submitError.message || 'Failed to remove league manager');
    }
  }

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
    return <p className="text-sm">Loading league...</p>;
  }

  if (!league) {
    return <p className="text-sm text-red-600">{error || 'League not found'}</p>;
  }

  const leagueName = league.name?.trim();

  const breadcrumbs = [{ label: 'Admin', href: '/admin' }, { label: league.name }];

  return (
    <main className="space-y-8">
      <Breadcrumbs crumbs={breadcrumbs} />

      <PageHeader
        title={leagueName || 'Unnamed league'}
        titleAriaLabel="League Name"
        description={`${league.seasonLabel || 'Season TBD'} • ${league.status}`}
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-900">League Games</h2>
          <Link
            to={`/admin/leagues/${league.id}/games/new`}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
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
                      <p className="font-medium text-slate-900">{game.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                        <span>
                          {game.homeTeamName} vs {game.awayTeamName}
                        </span>
                        <span>•</span>
                        <span>{game.status}</span>
                        {scoreLabel ? (
                          <>
                            <span>•</span>
                            <span className="font-semibold tabular-nums text-slate-800">
                              {scoreLabel}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
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
                      aria-label={`Open details for ${game.title}`}
                      disabled={!canNavigate}
                      className="rounded-md border border-slate-300 p-2 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => {
                        if (gameId) navigate(`/games/${gameId}`);
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
                        <circle cx="12" cy="12" r="3" />
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
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">Standings</h2>
        <LeagueStandingsTable
          standings={league.standings || []}
          getTeamHref={(row) => `/admin/leagues/${league.id}/teams/${row.teamId}`}
          className="mt-4"
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">Create Team</h2>
        <form onSubmit={onCreateTeam} className="mt-4 flex flex-wrap gap-3">
          <input
            autoComplete="off"
            type="text"
            className="min-w-[14rem] flex-1 rounded border border-slate-300 px-3 py-2"
            placeholder="Team name"
            value={newTeamName}
            onChange={(event) => setNewTeamName(event.target.value)}
          />
          <button
            aria-label="submit"
            type="submit"
            disabled={isSubmittingTeam}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            {isSubmittingTeam ? 'Adding...' : 'Add Team'}
          </button>
        </form>
      </section>

      {isOwner ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-xl font-semibold text-slate-900">League Managers</h2>
          <p className="mt-1 text-sm text-slate-600">
            League managers can manage all teams and games but cannot delete the league.
          </p>
          {managerError ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {managerError}
            </p>
          ) : null}
          {leagueManagers.length > 0 ? (
            <ul className="mt-4 divide-y divide-slate-100">
              {leagueManagers.map((manager) => (
                <li key={manager.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{manager.userName || 'Unknown'}</p>
                    <p className="text-sm text-slate-500">{manager.userEmail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveLeagueManager(manager.id)}
                    className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No league managers yet.</p>
          )}
          <form onSubmit={onAddLeagueManager} className="mt-4 flex flex-wrap gap-3">
            <input
              autoComplete="off"
              type="email"
              className="min-w-[14rem] flex-1 rounded border border-slate-300 px-3 py-2"
              placeholder="manager@email.com"
              value={newManagerEmail}
              onChange={(event) => setNewManagerEmail(event.target.value)}
            />
            <button
              aria-label="manager-submit"
              type="submit"
              disabled={isSubmittingManager}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isSubmittingManager ? 'Adding...' : 'Add Manager'}
            </button>
          </form>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Public Visibility</h2>
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
            {isUpdatingLeague ? 'Saving...' : league.isPublic ? 'Hide From Public' : 'Make Public'}
          </button>
        </div>
        <p className="mt-3 text-sm text-slate-700">
          Current visibility:{' '}
          <span className="font-semibold">{league.isPublic ? 'Public' : 'Private'}</span>
        </p>
      </section>
    </main>
  );
}
