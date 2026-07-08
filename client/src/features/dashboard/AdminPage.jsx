import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const TABS = [
  {
    id: 'leagues',
    label: 'My Leagues',
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
    id: 'games',
    label: 'One-off Games',
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
    label: 'One-off Teams',
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
];
import { useAuth } from '../../app/store/AuthContext';
import { teamsApi } from '../teams/api/teamsApi';
import { gamesApi } from '../games/api/gamesApi';
import { leaguesApi } from '../leagues/api/leaguesApi';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { DarkPageHeader } from '../../components/DarkPageHeader';
import { getLeagueHeaderImage } from '../feed/cardImage';
import teamPlaceholder from '../../assets/placeholders/team-logo-placeholder.svg';
import { CloudinaryImage } from '../media/CloudinaryImage';

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

function getGameContextLabel(game) {
  return game?.gameContext === 'league' ? 'League game' : 'One-off game';
}

function getLeagueRoleLabel(viewerRole) {
  if (viewerRole === 'owner') return 'League Owner';
  if (viewerRole === 'league_manager') return 'League Admin';
  if (viewerRole === 'team_manager') return 'Team Manager';
  if (viewerRole === 'player') return 'Player';
  if (viewerRole === 'helper') return 'Helper';
  return 'Member';
}

function QuickActionLink({ to, label, primary = false, children }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
        primary
          ? 'border-[#141414] bg-[#141414] text-white hover:bg-[#1B4332]'
          : 'border-slate-300 bg-white text-slate-800 hover:border-[#F4A300]/60 hover:bg-slate-50'
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

export function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [games, setGames] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedGameId, setCopiedGameId] = useState('');
  const [activeTab, setActiveTab] = useState('leagues');

  const recentGames = [...games]
    .sort((gameA, gameB) => {
      const dateA = parseGameDate(gameA);
      const dateB = parseGameDate(gameB);

      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateB.getTime() - dateA.getTime();
    })
    .slice(0, 3);

  useEffect(() => {
    Promise.all([teamsApi.list(), gamesApi.list(), leaguesApi.list()])
      .then(([teamsResponse, gamesResponse, leaguesResponse]) => {
        setTeams(teamsResponse.teams || []);
        setGames(gamesResponse.games || []);
        setLeagues(leaguesResponse.leagues || []);
      })
      .catch((loadError) => setError(loadError.message || 'Failed to load admin'))
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
    <main className="space-y-6 bg-[#F7F5F0] -m-4 p-4 md:-m-6 md:p-6">
      <Breadcrumbs crumbs={[{ label: 'Admin' }]} />

      <DarkPageHeader
        titleAriaLabel="Admin"
        eyebrow="Dashboard"
        title="Admin"
        description="Manage your leagues and non-league teams all in one place."
      >
        {user?.name ? <p className="text-sm text-white/60">Welcome back, {user.name}.</p> : null}
      </DarkPageHeader>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <article className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">Leagues</p>
          <p
            className="mt-0.5 text-xl leading-none text-[#F4A300]"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            {isLoading ? '—' : leagues.length}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">One-off Teams</p>
          <p
            className="mt-0.5 text-xl leading-none text-[#F4A300]"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            {isLoading ? '—' : teams.length}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">All Games</p>
          <p
            className="mt-0.5 text-xl leading-none text-[#F4A300]"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            {isLoading ? '—' : games.length}
          </p>
        </article>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div
          className="grid border-b border-slate-200"
          style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}
        >
          {TABS.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-label={tab.label}
              className={`flex flex-col items-center gap-1 py-3 text-xs font-semibold transition ${
                index < TABS.length - 1 ? 'border-r border-slate-200' : ''
              } ${
                activeTab === tab.id
                  ? 'bg-[#141414] text-white'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 'leagues' ? (
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2
                    className="text-lg text-slate-900"
                    style={{ fontFamily: "'Archivo Black', sans-serif" }}
                  >
                    My Leagues
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Leagues bring multiple teams under one roof — standings, fixtures, and join
                    requests all in one place.
                  </p>
                </div>
                <Link
                  to="/pricing"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#F4A300]/60 hover:bg-slate-50"
                >
                  New League
                </Link>
              </div>
              {isLoading ? (
                <p className="mt-3 text-sm text-slate-500">Loading leagues…</p>
              ) : leagues.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                  <p className="text-sm text-slate-600">
                    No leagues yet.{' '}
                    <Link
                      to="/pricing"
                      className="font-medium text-slate-900 underline decoration-[#F4A300] decoration-2 underline-offset-4 hover:text-[#1B4332]"
                    >
                      Start your 14-day trial →
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  {leagues.map((league) => (
                    <Link
                      key={league.id}
                      to={`/admin/leagues/${league.id}`}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-[#F4A300]/60 hover:bg-white"
                    >
                      <CloudinaryImage
                        src={getLeagueHeaderImage(league)}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                        decoding="async"
                        srcSetWidths={[40, 80, 120]}
                        sizes="40px"
                        className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{league.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{league.seasonLabel || 'Season TBD'}</span>
                          <span>•</span>
                          <span>{league.status}</span>
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold text-slate-700">
                            {getLeagueRoleLabel(league.viewerContext?.viewerRole)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === 'games' ? (
            <div>
              <h2
                className="text-lg text-slate-900"
                style={{ fontFamily: "'Archivo Black', sans-serif" }}
              >
                One-off Games
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Standalone games tracked independently, outside of any league.
              </p>
              {isLoading ? (
                <p className="mt-3 text-sm text-slate-500">Loading games…</p>
              ) : recentGames.length === 0 ? (
                <p className="mt-3 text-sm text-slate-600">No games recorded yet.</p>
              ) : (
                <div className="mt-3 divide-y divide-slate-100">
                  {recentGames.map((game, index) => {
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
                            <p className="font-medium text-slate-900">
                              {getGameTitle(game, index)}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                              <span>
                                {gameDate ? gameDate.toLocaleDateString() : 'Date unavailable'}
                              </span>
                              <span>•</span>
                              <span>{getGameStatus(game)}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                {getGameContextLabel(game)}
                              </span>
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
          ) : null}

          {activeTab === 'teams' ? (
            <div>
              <h2
                className="text-lg text-slate-900"
                style={{ fontFamily: "'Archivo Black', sans-serif" }}
              >
                One-off Teams
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Standalone teams and their games, managed independently from any league.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <QuickActionLink to="/games/new" label="New Game">
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
                <QuickActionLink to="/games" label="Games">
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
                <QuickActionLink to="/teams" label="Teams">
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
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
