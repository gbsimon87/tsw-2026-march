import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { leaguesApi } from '../api/leaguesApi';
import playerPlaceholder from '../../../assets/placeholders/player-placeholder.svg';
import teamPlaceholder from '../../../assets/placeholders/team-logo-placeholder.svg';
import { getLeagueHeaderImage } from '../../feed/cardImage';
import { Breadcrumbs } from '../../../components/Breadcrumbs';
import { SportsLoader } from '../../../components/SportsLoader';
import { StatsTable } from '../../teams/components/StatsTable';
import { extractYouTubeVideoId } from '../../games/youtube';
import { feedApi } from '../../feed/api/feedApi';
import { CloudinaryImage } from '../../media/CloudinaryImage';

const HIGHLIGHT_LABELS = {
  FG2_MADE: '2PT Make',
  FG2_MISS: '2PT Miss',
  FG3_MADE: '3PT Make',
  FG3_MISS: '3PT Miss',
  FT_MADE: 'FT Make',
  FT_MISS: 'FT Miss',
  AST: 'Assist',
  STL: 'Steal',
  BLK: 'Block',
};

const HIGHLIGHT_PRIORITY = { FG3_MADE: 0, FG2_MADE: 1 };
const MAX_HIGHLIGHTS = 5;

function selectHighlights(highlights) {
  return [...(highlights || [])]
    .sort((a, b) => {
      const pa = HIGHLIGHT_PRIORITY[a.statType] ?? 2;
      const pb = HIGHLIGHT_PRIORITY[b.statType] ?? 2;
      return pa - pb;
    })
    .slice(0, MAX_HIGHLIGHTS);
}

function HighlightClip({ videoUrl, timestamp, statType, gameTitle }) {
  const videoId = extractYouTubeVideoId(videoUrl);
  if (!videoId) return null;
  const start = Math.max(0, timestamp - 5);
  const end = timestamp + 5;
  const src = `https://www.youtube.com/embed/${videoId}?start=${start}&end=${end}&autoplay=0&controls=1&rel=0&modestbranding=1&playsinline=1`;
  return (
    <div className="flex w-64 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="aspect-video w-full bg-slate-950">
        <iframe
          className="h-full w-full"
          src={src}
          title={`${HIGHLIGHT_LABELS[statType] || statType} — ${gameTitle || 'Game'}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-semibold text-slate-900">
          {HIGHLIGHT_LABELS[statType] || statType}
        </p>
        {gameTitle ? <p className="truncate text-xs text-slate-400">{gameTitle}</p> : null}
      </div>
    </div>
  );
}

function formatGameDate(game) {
  const rawValue = game.completedAt || game.scheduledAt || game.createdAt || null;
  if (!rawValue) {
    return 'Date unavailable';
  }

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return 'Date unavailable';
  }

  return parsed.toLocaleDateString();
}

function formatAverage(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

export function PublicLeaguePlayerPage() {
  const { leagueSlug, teamSlug, leaguePlayerId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [claimStatus, setClaimStatus] = useState('');
  const [claimError, setClaimError] = useState('');
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);
  const [clipShareState, setClipShareState] = useState({});
  const pendingHandled = useRef(false);
  const pendingKey = `claim_pending_${leagueSlug}_${teamSlug}_${leaguePlayerId}`;

  useEffect(() => {
    leaguesApi
      .getPublicPlayer(leagueSlug, teamSlug, leaguePlayerId)
      .then(setData)
      .catch((loadError) => setError(loadError.message || 'Failed to load player'))
      .finally(() => setIsLoading(false));
  }, [leagueSlug, teamSlug, leaguePlayerId]);

  useEffect(() => {
    if (!data?.player || !user || pendingHandled.current) return;
    const raw = sessionStorage.getItem(pendingKey);
    if (!raw) return;
    pendingHandled.current = true;
    sessionStorage.removeItem(pendingKey);
    submitClaim(data.league, data.team);
  }, [data, user]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitClaim(lg, tm) {
    setClaimError('');
    setClaimStatus('');
    setIsSubmittingClaim(true);
    try {
      await leaguesApi.createJoinRequest(lg.id, tm.id, {
        requestedRole: 'player',
        requestedLeaguePlayerId: leaguePlayerId,
      });
      setClaimStatus("Request submitted. Please wait for the team manager's approval.");
    } catch (submitError) {
      const msg = submitError.message || '';
      if (/pending join request already exists/i.test(msg)) {
        setClaimStatus('You already have a pending claim request for this profile.');
      } else {
        setClaimError(msg || 'Failed to submit claim request.');
      }
    } finally {
      setIsSubmittingClaim(false);
    }
  }

  async function onClaim() {
    if (!user) {
      sessionStorage.setItem(pendingKey, '1');
      navigate(`/login?redirectTo=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    await submitClaim(data.league, data.team);
  }

  const canShareOwnHighlights = Boolean(user && data?.player?.isMe);

  async function shareHighlightClip(eventId, gameId) {
    setClipShareState((s) => ({ ...s, [eventId]: 'loading' }));
    try {
      await feedApi.createHighlightClipPost({ gameId, eventId });
      setClipShareState((s) => ({ ...s, [eventId]: 'shared' }));
    } catch (err) {
      const msg = err.message?.toLowerCase().includes('already been shared')
        ? 'Already shared'
        : 'Failed to share';
      setClipShareState((s) => ({ ...s, [eventId]: msg }));
    }
  }

  const totals = useMemo(() => {
    return (data?.games || []).reduce(
      (summary, game) => ({
        points: summary.points + game.stats.points,
        reb: summary.reb + game.stats.reb,
        ast: summary.ast + game.stats.ast,
        stl: summary.stl + game.stats.stl,
        blk: summary.blk + (game.stats.blk || 0),
        tov: summary.tov + game.stats.tov,
        foul: summary.foul + game.stats.foul,
      }),
      { points: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, foul: 0 }
    );
  }, [data]);

  if (isLoading) {
    return <SportsLoader label="Loading player" fullPage />;
  }

  if (!data?.player) {
    return <p className="text-sm text-red-600">{error || 'League player not found'}</p>;
  }

  const { league, team, player, summary, games } = data;
  const playerLabel =
    typeof player.jerseyNumber === 'number'
      ? `#${player.jerseyNumber} ${player.displayName}`
      : player.displayName;
  const averageStats = [
    { label: 'GP', value: summary.gamesCount },
    { label: 'PPG', value: formatAverage(summary.pointsPerGame) },
    { label: 'RPG', value: formatAverage(summary.reboundsPerGame) },
    { label: 'APG', value: formatAverage(summary.assistsPerGame) },
  ];
  const totalStats = [
    { label: 'PTS', value: totals.points, featured: false },
    { label: 'REB', value: totals.reb, featured: false },
    { label: 'AST', value: totals.ast, featured: false },
    { label: 'STL', value: totals.stl },
    { label: 'BLK', value: totals.blk },
    { label: 'TOV', value: totals.tov },
    { label: 'FOUL', value: totals.foul },
  ];
  const gameLogRows = games.map((game) => ({
    id: game.gameId,
    opponent: game.opponent || 'Opponent',
    opponentLogoUrl: game.opponentLogoUrl || null,
    opponentHref: game.opponentDestination?.href || `/games/${game.gameId}`,
    dateLabel: formatGameDate(game),
    dateValue: game.completedAt || game.scheduledAt || game.createdAt || null,
    ...game.stats,
    blk: game.stats.blk || 0,
  }));
  const gameLogColumns = [
    {
      id: 'opponent',
      label: 'Opp',
      align: 'left',
      sortKey: 'opponent',
      render: (row) => (
        <Link
          to={row.opponentHref}
          className="inline-flex items-center gap-2 font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:text-[#1B4332] hover:decoration-[#F4A300]"
        >
          <CloudinaryImage
            src={row.opponentLogoUrl || teamPlaceholder}
            alt=""
            width={24}
            height={24}
            loading="lazy"
            decoding="async"
            srcSetWidths={[24, 48, 72]}
            sizes="24px"
            className="h-6 w-6 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
          />
          <span>{row.opponent}</span>
        </Link>
      ),
    },
    {
      id: 'date',
      label: 'Date',
      align: 'left',
      sortKey: 'dateValue',
      render: (row) => row.dateLabel,
    },
    { id: 'points', label: 'PTS', align: 'right', render: (row) => row.points },
    { id: 'reb', label: 'REB', align: 'right', render: (row) => row.reb },
    { id: 'ast', label: 'AST', align: 'right', render: (row) => row.ast },
    { id: 'stl', label: 'STL', align: 'right', render: (row) => row.stl },
    { id: 'blk', label: 'BLK', align: 'right', render: (row) => row.blk },
    { id: 'tov', label: 'TOV', align: 'right', render: (row) => row.tov },
    { id: 'foul', label: 'FOUL', align: 'right', render: (row) => row.foul },
  ];

  const breadcrumbs = [
    { label: 'Discover', href: '/home' },
    { label: league.name, href: `/league/${league.slug}` },
    { label: team.name, href: `/league/${league.slug}/teams/${team.slug}` },
    { label: player.displayName },
  ];

  return (
    <main className="mx-auto max-w-5xl space-y-6 bg-[#F7F5F0] -m-4 p-4 md:-m-6 md:p-6">
      <Breadcrumbs crumbs={breadcrumbs} />

      {/* Player card header */}
      <section
        aria-labelledby="league-player-profile-title"
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
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex w-full items-center justify-between gap-4 sm:w-auto sm:justify-start">
            <div className="relative shrink-0">
              <CloudinaryImage
                src={player.avatarUrl || playerPlaceholder}
                alt=""
                width={80}
                height={80}
                loading="eager"
                decoding="async"
                srcSetWidths={[80, 160, 240]}
                sizes="80px"
                className="h-20 w-20 rounded-2xl border-2 border-white/10 bg-white object-cover"
              />
              {typeof player.jerseyNumber === 'number' && (
                <span
                  className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#141414] bg-[#F4A300] text-sm text-[#141414]"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  {player.jerseyNumber}
                </span>
              )}
            </div>
            <div className="ml-auto grid grid-cols-4 gap-2 rounded-2xl bg-white/5 p-2 sm:ml-0">
              {averageStats.map((stat) => (
                <div
                  key={stat.label}
                  className="min-w-14 rounded-xl bg-white/5 px-3 py-2 text-center"
                >
                  <p
                    className="text-lg leading-none text-[#F4A300]"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    {stat.value}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-white/50">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1
                id="league-player-profile-title"
                className="text-2xl leading-tight text-white md:text-3xl"
                style={{ fontFamily: "'Archivo Black', sans-serif" }}
              >
                {playerLabel}
              </h1>
              {player.isClaimed ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#F4A300]/40 bg-[#F4A300]/10 px-2.5 py-1 text-xs font-semibold text-[#F4A300]">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 12l3 3 5-5" />
                  </svg>
                  {player.claimedBadgeLabel}
                </span>
              ) : claimStatus ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
                  {claimStatus}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={isSubmittingClaim}
                  onClick={onClaim}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/80 transition hover:border-[#F4A300]/50 hover:text-[#F4A300] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  >
                    <circle cx="7" cy="5" r="2.5" />
                    <path d="M2 13c0-2.2 2.2-4 5-4" />
                    <path d="M12 9v4M10 11h4" />
                  </svg>
                  {isSubmittingClaim ? 'Submitting…' : 'Claim this profile'}
                </button>
              )}
            </div>
            {claimError ? <p className="mt-2 text-xs text-[#F4A300]">{claimError}</p> : null}
            <nav aria-label="Player affiliations" className="mt-3">
              <ul className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold uppercase tracking-wide text-white/60">
                <li>
                  <Link
                    to={`/league/${league.slug}`}
                    className="inline-flex items-center gap-2 transition hover:text-[#F4A300] hover:underline"
                  >
                    <CloudinaryImage
                      src={getLeagueHeaderImage(league)}
                      alt=""
                      width={20}
                      height={20}
                      loading="lazy"
                      decoding="async"
                      srcSetWidths={[20, 40, 60]}
                      sizes="20px"
                      className="h-5 w-5 shrink-0 rounded-full border border-white/10 bg-white object-cover"
                    />
                    <span>{league.name}</span>
                  </Link>
                </li>
                <li aria-hidden="true" className="text-white/20">
                  /
                </li>
                <li>
                  <Link
                    to={`/league/${league.slug}/teams/${team.slug}`}
                    className="inline-flex items-center gap-2 transition hover:text-[#F4A300] hover:underline"
                  >
                    <CloudinaryImage
                      src={team.logo?.url || teamPlaceholder}
                      alt=""
                      width={20}
                      height={20}
                      loading="lazy"
                      decoding="async"
                      srcSetWidths={[20, 40, 60]}
                      sizes="20px"
                      className="h-5 w-5 shrink-0 rounded-full border border-white/10 bg-white object-cover"
                    />
                    <span>{team.name}</span>
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </section>

      {/* Season totals scoreboard */}
      <section className="rounded-2xl bg-white border border-slate-200 p-6 md:p-8">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
              Season totals
            </p>
            <h2
              className="mt-1 text-2xl text-slate-900"
              style={{ fontFamily: "'Archivo Black', sans-serif" }}
            >
              Production Snapshot
            </h2>
          </div>
          <p
            className="text-sm text-slate-400"
            style={{ fontFamily: "'IBM Plex Mono', monospace" }}
          >
            {summary.gamesCount} GP
          </p>
        </header>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-7">
          {totalStats.map((stat) => (
            <article
              key={stat.label}
              className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-center transition hover:border-[#F4A300]/60 hover:bg-white"
            >
              <p
                className="text-2xl leading-none text-[#F4A300]"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {stat.value}
              </p>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {stat.label}
              </p>
            </article>
          ))}
        </div>
      </section>

      {data.highlights?.length > 0 ? (
        <section className="rounded-2xl bg-white border border-slate-200 p-6 md:p-8">
          <header className="border-b border-slate-100 pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
              Film room
            </p>
            <h2
              className="mt-1 text-2xl text-slate-900"
              style={{ fontFamily: "'Archivo Black', sans-serif" }}
            >
              Highlights
            </h2>
          </header>
          <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
            {selectHighlights(data.highlights).map((h) => {
              const clipState =
                clipShareState[h.eventId] ||
                (data.sharedEventIds?.includes(h.eventId) ? 'shared' : 'idle');
              return (
                <div key={h.eventId} className="flex shrink-0 flex-col">
                  <HighlightClip
                    videoUrl={h.videoUrl}
                    timestamp={h.videoTimestamp}
                    statType={h.statType}
                    gameTitle={h.gameTitle}
                  />
                  {canShareOwnHighlights ? (
                    <button
                      type="button"
                      disabled={clipState === 'loading' || clipState === 'shared'}
                      onClick={() => shareHighlightClip(h.eventId, h.gameId)}
                      className="mt-1.5 w-full rounded-lg border border-slate-200 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-[#F4A300]/60 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {clipState === 'loading'
                        ? 'Sharing…'
                        : clipState === 'shared'
                          ? '✓ Shared to Pulse'
                          : clipState !== 'idle'
                            ? clipState
                            : 'Share to Pulse'}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl bg-white border border-slate-200 p-6 md:p-8">
        <header className="border-b border-slate-100 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
            Box scores
          </p>
          <h2
            className="mt-1 text-2xl text-slate-900"
            style={{ fontFamily: "'Archivo Black', sans-serif" }}
          >
            Game Log
          </h2>
        </header>
        <div className="mt-4 overflow-x-auto">
          <StatsTable columns={gameLogColumns} rows={gameLogRows} tableClassName="w-full text-sm" />
        </div>
      </section>
    </main>
  );
}
