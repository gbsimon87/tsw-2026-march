import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { leaguesApi } from '../api/leaguesApi';
import { LeagueStandingsTable } from '../components/LeagueStandingsTable';
import { Breadcrumbs } from '../../../components/Breadcrumbs';

export function AdminLeaguePage() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [league, setLeague] = useState(null);
  const [copiedGameId, setCopiedGameId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [isSubmittingTeam, setIsSubmittingTeam] = useState(false);
  const [isUpdatingLeague, setIsUpdatingLeague] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState('');

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

  async function onUploadLogo() {
    if (!logoFile) return;
    setLogoError('');
    setIsUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('logo', logoFile);
      const response = await leaguesApi.uploadLogo(leagueId, formData);
      setLeague(response.league);
      setLogoFile(null);
    } catch (uploadError) {
      setLogoError(uploadError.message || 'Failed to upload logo');
    } finally {
      setIsUploadingLogo(false);
    }
  }

  async function onRemoveLogo() {
    setLogoError('');
    setIsUploadingLogo(true);
    try {
      const response = await leaguesApi.removeLogo(leagueId);
      setLeague(response.league);
    } catch (uploadError) {
      setLogoError(uploadError.message || 'Failed to remove logo');
    } finally {
      setIsUploadingLogo(false);
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

  const breadcrumbs = [{ label: 'Admin', href: '/admin' }, { label: league.name }];

  return (
    <main className="space-y-8">
      <Breadcrumbs crumbs={breadcrumbs} />

      <section className="rounded-3xl bg-gradient-to-r from-sky-50 via-white to-amber-50 p-8 md:p-10">
        <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">{league.name}</h1>
        <p className="mt-2 text-base text-slate-700">
          {league.seasonLabel || 'Season TBD'} • {league.status}
        </p>
      </section>

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
                  ? ` • ${game.homePoints}–${game.awayPoints}`
                  : '';

              return (
                <article
                  key={gameId || game.title}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{game.title}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {game.homeTeamName} vs {game.awayTeamName} • {game.status}
                      {scoreLabel}
                    </p>
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
                      disabled={!canNavigate}
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
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Public Visibility</h2>
            <p className="mt-1 text-sm text-slate-600">
              Control whether this league appears in public discovery and public league pages.
            </p>
          </div>
          <button
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-xl font-semibold text-slate-900">League Logo</h2>
        <p className="mt-1 text-sm text-slate-600">
          Shown on game detail pages for all league games.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {league.logo?.url ? (
            <img
              src={league.logo.url}
              alt="League logo"
              className="h-14 w-14 rounded-full border border-slate-200 bg-white object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs text-slate-400">
              None
            </div>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
            disabled={isUploadingLogo}
            onChange={(event) => setLogoFile(event.target.files?.[0] || null)}
          />
          <button
            type="button"
            disabled={!logoFile || isUploadingLogo}
            onClick={onUploadLogo}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isUploadingLogo ? 'Saving...' : 'Upload'}
          </button>
          {league.logo?.url ? (
            <button
              type="button"
              disabled={isUploadingLogo}
              onClick={onRemoveLogo}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
            >
              Remove
            </button>
          ) : null}
        </div>
        {logoError ? <p className="mt-3 text-sm text-red-600">{logoError}</p> : null}
      </section>
    </main>
  );
}
