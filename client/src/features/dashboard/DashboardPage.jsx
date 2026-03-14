import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/store/AuthContext';
import { teamsApi } from '../teams/api/teamsApi';
import { gamesApi } from '../games/api/gamesApi';

function parseGameDate(game) {
  const rawDate =
    game?.gameDate ||
    game?.date ||
    game?.playedAt ||
    game?.finishedAt ||
    game?.updatedAt ||
    game?.createdAt ||
    null;

  if (!rawDate) {
    return null;
  }

  const parsed = new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getGameTitle(game, index) {
  return game?.title || game?.name || game?.opponent || `Game ${index + 1}`;
}

function getGameStatus(game) {
  if (game?.status === 'finished' || game?.finishedAt || game?.isFinished) {
    return 'Finished';
  }
  if (game?.status === 'in_progress' || game?.status === 'live') {
    return 'In Progress';
  }
  return 'Scheduled';
}

function QuickActionLink({ to, label, primary = false, children }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
        primary
          ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-700'
          : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
      }`}
    >
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          primary ? 'bg-white/12' : 'bg-slate-100'
        }`}
      >
        {children}
      </span>
      <span>{label}</span>
    </Link>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [games, setGames] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedGameId, setCopiedGameId] = useState('');

  const visibleTeams = teams.slice(0, 3);
  const hiddenTeamsCount = Math.max(teams.length - visibleTeams.length, 0);

  const recentGames = [...games]
    .sort((gameA, gameB) => {
      const dateA = parseGameDate(gameA);
      const dateB = parseGameDate(gameB);

      if (!dateA && !dateB) {
        return 0;
      }
      if (!dateA) {
        return 1;
      }
      if (!dateB) {
        return -1;
      }
      return dateB.getTime() - dateA.getTime();
    })
    .slice(0, 5);

  const lastActivityDate = recentGames.length > 0 ? parseGameDate(recentGames[0]) : null;
  const lastActivityText = lastActivityDate
    ? lastActivityDate.toLocaleDateString()
    : 'No games yet';

  useEffect(() => {
    Promise.all([teamsApi.list(), gamesApi.list()])
      .then(([teamsResponse, gamesResponse]) => {
        setTeams(teamsResponse.teams || []);
        setGames(gamesResponse.games || []);
      })
      .catch((loadError) => setError(loadError.message || 'Failed to load dashboard'))
      .finally(() => setIsLoading(false));
  }, []);

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

  return (
    <main className="space-y-8">
      <section className="rounded-3xl bg-gradient-to-r from-amber-50 via-white to-sky-50 p-8 md:p-10">
        <h1 className="text-3xl font-bold leading-tight text-slate-900 md:text-4xl">Dashboard</h1>
        <p className="mt-2 text-base text-slate-700">
          Keep your team moving forward with fast actions and clear game context.
        </p>
        {user?.name ? (
          <p className="mt-1 text-sm text-slate-600">Welcome back, {user.name}.</p>
        ) : null}
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section aria-labelledby="quick-actions-heading" className="space-y-3">
        <h2 id="quick-actions-heading" className="text-xl font-semibold text-slate-900">
          Quick Actions
        </h2>
        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
          <QuickActionLink to="/games/new" label="New Game" primary>
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </QuickActionLink>
          <QuickActionLink to="/games" label="View Games">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 19h16" />
              <path d="M7 16V8" />
              <path d="M12 16V5" />
              <path d="M17 16v-4" />
            </svg>
          </QuickActionLink>
          <QuickActionLink to="/teams/new" label="New Team">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="10" cy="7" r="3" />
              <path d="M19 8v6" />
              <path d="M16 11h6" />
            </svg>
          </QuickActionLink>
        </div>
      </section>

      <section aria-labelledby="summary-heading" className="space-y-3">
        <h2 id="summary-heading" className="text-xl font-semibold text-slate-900">
          Summary
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Teams</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {isLoading ? '...' : teams.length}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Games</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {isLoading ? '...' : games.length}
            </p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Last Activity</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {isLoading ? 'Loading...' : lastActivityText}
            </p>
          </article>
        </div>
      </section>

      <section
        aria-labelledby="team-snapshot-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5"
      >
        <h2 id="team-snapshot-heading" className="text-xl font-semibold text-slate-900">
          Team Snapshot
        </h2>
        {isLoading ? <p className="mt-2 text-sm text-slate-600">Loading teams...</p> : null}
        {!isLoading && teams.length === 0 ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-slate-700">
              No team yet. Create your first team to start tracking.
            </p>
            <Link
              to="/teams/new"
              className="inline-flex rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Create Team
            </Link>
          </div>
        ) : null}
        {!isLoading && teams.length > 0 ? (
          <div className="mt-3 space-y-2">
            {visibleTeams.map((team) => (
              <article
                key={team.id || team._id || team.name}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {team.name || 'Unnamed Team'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Active roster: {(team.players || []).filter((player) => player.isActive).length}
                  </p>
                </div>
                {team.id ? (
                  <Link
                    to={`/teams/${team.id}/edit`}
                    aria-label={`Edit ${team.name || 'team'}`}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Edit
                  </Link>
                ) : null}
              </article>
            ))}
            {hiddenTeamsCount > 0 ? (
              <p className="text-sm font-medium text-slate-500">+{hiddenTeamsCount} more</p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="recent-games-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5"
      >
        <h2 id="recent-games-heading" className="text-xl font-semibold text-slate-900">
          Recent Games
        </h2>
        {isLoading ? <p className="mt-2 text-sm text-slate-600">Loading games...</p> : null}
        {!isLoading && recentGames.length === 0 ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-slate-700">No games recorded yet.</p>
            <Link
              to="/games/new"
              className="inline-flex rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Start New Game
            </Link>
          </div>
        ) : null}
        {!isLoading && recentGames.length > 0 ? (
          <div className="mt-3 divide-y divide-slate-100">
            {recentGames.map((game, index) => {
              const gameDate = parseGameDate(game);
              const gameId = game.id || game._id;
              const canNavigateToGame = Boolean(gameId);

              return (
                <article
                  key={gameId || `${getGameTitle(game, index)}-${index}`}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">{getGameTitle(game, index)}</p>
                    <p className="text-sm text-slate-600">
                      {gameDate ? gameDate.toLocaleDateString() : 'Date unavailable'} •{' '}
                      {getGameStatus(game)}
                    </p>
                    <p className="text-sm text-slate-600">Opponent: {game.opponent || 'N/A'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Copy share link for ${getGameTitle(game, index)}`}
                      disabled={!canNavigateToGame}
                      className="rounded-md border border-slate-300 p-2 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => {
                        if (gameId) {
                          copyShareUrl(gameId);
                        }
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
                      aria-label={`Open details for ${getGameTitle(game, index)}`}
                      disabled={!canNavigateToGame}
                      className="rounded-md border border-slate-300 p-2 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => {
                        if (gameId) {
                          navigate(`/games/${gameId}`);
                        }
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
                      aria-label={`Track ${getGameTitle(game, index)}`}
                      disabled={!canNavigateToGame}
                      className="rounded-md border border-slate-300 p-2 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => {
                        if (gameId) {
                          navigate(`/games/${gameId}/track`);
                        }
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
        ) : null}
      </section>
    </main>
  );
}
