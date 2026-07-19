import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { teamsApi } from '../api/teamsApi';
import { gamesApi } from '../../games/api/gamesApi';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { SportsLoader } from '../../../components/SportsLoader';
import { CloudinaryImage } from '../../media/CloudinaryImage';
import { BillingStatusPill } from '../../billing/components/BillingStatusPill';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';

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

export function AdminTeamPage() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [games, setGames] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedGameId, setCopiedGameId] = useState('');

  useEffect(() => {
    setIsLoading(true);
    setError('');
    Promise.all([teamsApi.getById(teamId), gamesApi.list({ teamId })])
      .then(([teamResponse, gamesResponse]) => {
        setTeam(teamResponse.team || null);
        setGames(gamesResponse.games || []);
      })
      .catch((loadError) => setError(loadError.message || 'Failed to load team'))
      .finally(() => setIsLoading(false));
  }, [teamId]);

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
    return <SportsLoader label="Loading team" fullPage />;
  }

  if (!team) {
    return <p className="text-sm text-red-600">{error || 'Team not found'}</p>;
  }

  const teamName = team.name || 'Unnamed Team';
  const activePlayerCount = (team.players || []).filter((player) => player.isActive).length;
  const breadcrumbs = [{ label: 'Admin', href: '/admin' }, { label: teamName }];

  return (
    <main className="space-y-6 bg-[#F7F5F0] -m-4 p-4 md:-m-6 md:p-6">
      <Breadcrumbs crumbs={breadcrumbs} />

      <section
        aria-label={teamName}
        className="relative overflow-hidden rounded-2xl bg-[#141414] p-5 md:p-8"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, #fff 0, #fff 1px, transparent 1px, transparent 64px)',
          }}
        />
        <div className="relative flex items-center gap-4">
          <CloudinaryImage
            src={team.logo?.url || teamPlaceholder}
            alt=""
            width={56}
            height={56}
            loading="lazy"
            decoding="async"
            srcSetWidths={[56, 112, 168]}
            sizes="56px"
            className="h-14 w-14 shrink-0 rounded-full border border-white/20 bg-white object-cover"
          />
          <div className="min-w-0">
            <h1
              className="truncate text-xl text-white md:text-2xl"
              style={{ fontFamily: "'Archivo Black', sans-serif" }}
            >
              {teamName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/60">
              <span>Active roster: {activePlayerCount}</span>
              {teamId ? (
                <BillingStatusPill billing={team.billing} scope="team" resourceId={teamId} />
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link
          to="/games/new"
          className="flex items-center gap-3 rounded-xl border border-[#141414] bg-[#141414] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1B4332]"
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/12">
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
          </span>
          <span>New Game</span>
        </Link>
        <Link
          to={`/teams/${teamId}/edit`}
          className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-[#F4A300]/60 hover:bg-slate-50"
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </span>
          <span>Edit Team</span>
        </Link>
        <Link
          to={`/teams/${teamId}`}
          className="flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-[#F4A300]/60 hover:bg-slate-50"
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </span>
          <span>View Public Page</span>
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5">
        <h2
          className="text-lg text-slate-900"
          style={{ fontFamily: "'Archivo Black', sans-serif" }}
        >
          Games
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Every game tracked for this team, most recent first.
        </p>
        {games.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No games recorded yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-slate-100">
            {[...games]
              .sort((gameA, gameB) => {
                const dateA = parseGameDate(gameA);
                const dateB = parseGameDate(gameB);

                if (!dateA && !dateB) return 0;
                if (!dateA) return 1;
                if (!dateB) return -1;
                return dateB.getTime() - dateA.getTime();
              })
              .map((game, index) => {
                const gameDate = parseGameDate(game);
                const gameId = game.id || game._id;
                const canNavigateToGame = Boolean(gameId);

                return (
                  <article
                    key={gameId || `${getGameTitle(game, index)}-${index}`}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex shrink-0 items-center">
                        <CloudinaryImage
                          src={game.homeLogoUrl || teamPlaceholder}
                          alt=""
                          width={32}
                          height={32}
                          loading="lazy"
                          decoding="async"
                          srcSetWidths={[32, 64, 96]}
                          sizes="32px"
                          className="h-8 w-8 rounded-full border border-slate-200 bg-white object-cover"
                        />
                        <CloudinaryImage
                          src={game.awayLogoUrl || teamPlaceholder}
                          alt=""
                          width={32}
                          height={32}
                          loading="lazy"
                          decoding="async"
                          srcSetWidths={[32, 64, 96]}
                          sizes="32px"
                          className="-ml-2 h-8 w-8 rounded-full border border-slate-200 bg-white object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{getGameTitle(game, index)}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                          <span>
                            {gameDate ? gameDate.toLocaleDateString() : 'Date unavailable'}
                          </span>
                          <span>•</span>
                          <span>{getGameStatus(game)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                      <button
                        type="button"
                        aria-label={`Copy share link for ${getGameTitle(game, index)}`}
                        disabled={!canNavigateToGame}
                        className="rounded-md border border-slate-300 p-2 text-slate-700 transition hover:border-[#F4A300]/60 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                        aria-label={`Open details for ${getGameTitle(game, index)}`}
                        disabled={!canNavigateToGame}
                        className="rounded-md border border-slate-300 p-2 text-slate-700 transition hover:border-[#F4A300]/60 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                        aria-label={`Track ${getGameTitle(game, index)}`}
                        disabled={!canNavigateToGame}
                        className="rounded-md border border-slate-300 p-2 text-slate-700 transition hover:border-[#F4A300]/60 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
      </div>
    </main>
  );
}
