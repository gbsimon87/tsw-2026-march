import { useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SportsLoader } from '../../../components/SportsLoader';
import { HighlightPlayer } from '../../video/components/HighlightPlayer';
import { getStatLabels } from '../../games/constants';
import { scrimmagesApi } from '../api/scrimmagesApi';

function timestamp(value) {
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function ScrimmagePlayerPage({ adminMode = false }) {
  const { scrimmageId, playerId } = useParams();
  const [search, setSearch] = useSearchParams();
  const [playType, setPlayType] = useState('all');
  const [visible, setVisible] = useState(12);
  const seasonId = search.get('seasonId') || '';
  const sessionId = search.get('sessionId') || '';
  const { data, isLoading, error } = useQuery({
    queryKey: ['scrimmagePlayer', scrimmageId, playerId, seasonId, sessionId],
    queryFn: () => scrimmagesApi.player(scrimmageId, playerId, { seasonId, sessionId }),
  });
  if (isLoading) return <SportsLoader label="Loading scrimmage player" />;
  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return null;
  const { player, scrimmage: series, stats, sessions, plays, games } = data;
  const basePath = `${adminMode ? '/admin' : ''}/scrimmage/${scrimmageId}`;
  if (series.canManage && !adminMode)
    return (
      <Navigate to={`/admin/scrimmage/${scrimmageId}/players/${playerId}?${search}`} replace />
    );
  if (adminMode && !series.canManage)
    return <Navigate to={`/scrimmage/${scrimmageId}/players/${playerId}?${search}`} replace />;
  if (player.id !== playerId)
    return <Navigate to={`${basePath}/players/${player.id}?${search}`} replace />;
  const rules = series.seasons.find((s) => s.id === data.seasonId)?.mvpRules;
  const filtered = plays.filter(
    (p) =>
      playType === 'all' ||
      (playType === 'made' && p.statType.endsWith('_MADE')) ||
      (playType === 'missed' && p.statType.endsWith('_MISS')) ||
      (playType === 'turnovers' && p.statType === 'TOV')
  );
  const scope = data.scope === 'weekly' ? 'Weekly' : 'Season';
  function filter(name, value) {
    const next = new URLSearchParams(search);
    if (value) next.set(name, value);
    else next.delete(name);
    if (name === 'seasonId') next.delete('sessionId');
    setVisible(12);
    setSearch(next);
  }
  return (
    <main className="space-y-6">
      <Link className="text-sm underline" to={`${basePath}?seasonId=${data.seasonId}`}>
        ← {series.name}
      </Link>
      <header>
        <p className="text-sm font-semibold text-[#1B4332]">{series.name} · Scrimmage profile</p>
        <h1 className="text-3xl font-bold text-slate-900">{player.displayName}</h1>
        {!player.isActive && <p className="text-sm text-slate-500">Inactive pool player</p>}
      </header>
      <div className="flex flex-wrap gap-4">
        <label className="text-sm font-medium">
          Season
          <select
            className="ml-2 rounded-lg border p-2"
            value={data.seasonId}
            onChange={(e) => filter('seasonId', e.target.value)}
          >
            {series.seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Weekly session
          <select
            className="ml-2 rounded-lg border p-2"
            value={sessionId}
            onChange={(e) => filter('sessionId', e.target.value)}
          >
            <option value="">All weeks</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} · {s.date}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section
        aria-label={`${scope} player statistics`}
        className="space-y-3 rounded-xl border bg-white p-5"
      >
        <h2 className="text-xl font-bold">{scope} stats</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ['Points', stats?.points ?? 0],
            ['FG%', stats?.fgPercentage == null ? '—' : `${stats.fgPercentage.toFixed(1)}%`],
            ['Turnovers', stats?.turnovers ?? 0],
            ['MVP', stats ? stats.mvpScore.toFixed(2) : '—'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-50 p-3">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-600">
          {stats?.gamesPlayed ?? 0} games played · {stats?.wins ?? 0} wins / {stats?.losses ?? 0}{' '}
          losses{stats?.draws ? ` / ${stats.draws} draws` : ''} · {stats?.makes ?? 0}/
          {stats?.attempts ?? 0} field goals · {stats?.misses ?? 0} misses
        </p>
        {rules && (
          <>
            <p className="text-sm text-slate-600">
              MVP = (Points − {rules.missPenalty} × missed field goals − {rules.turnoverPenalty} ×
              turnovers + {rules.winBonus} × wins − {rules.lossPenalty} × losses) ÷ games played.
            </p>
            <p className="text-xs text-slate-500">
              {stats?.eligible ? 'Eligible' : 'Provisional'} ·{' '}
              {data.scope === 'weekly'
                ? `Requires ${rules.weeklyMinGames} games this week.`
                : `Requires ${rules.seasonMinGames} games across ${rules.seasonMinWeeks} weeks.`}{' '}
              Only completed games count.
            </p>
          </>
        )}
      </section>
      <section className="space-y-4 rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Film room · Player plays</h2>
          <label className="text-sm">
            Play type
            <select
              className="ml-2 rounded-lg border p-2"
              value={playType}
              onChange={(e) => {
                setPlayType(e.target.value);
                setVisible(12);
              }}
            >
              <option value="all">All plays</option>
              <option value="made">Made shots</option>
              <option value="missed">Missed shots</option>
              <option value="turnovers">Turnovers</option>
            </select>
          </label>
        </div>
        <p className="text-sm text-slate-500">
          Clips play around each event’s timestamp in the full weekly recording.
        </p>
        {!filtered.length && (
          <p className="text-sm text-slate-600">No recorded plays for this selection yet.</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.slice(0, visible).map((play) => {
            const label = getStatLabels(play.scoringRules)[play.statType] || play.statType;
            const hasTimestamp = Number.isFinite(play.videoTimestamp) && play.videoTimestamp >= 0;
            return (
              <article
                key={`${play.gameId}:${play.eventId}`}
                className="overflow-hidden rounded-xl border border-slate-200"
              >
                {hasTimestamp && play.videoUrl ? (
                  <HighlightPlayer
                    highlight={play}
                    title={`${player.displayName} · ${label} · ${play.gameTitle}`}
                  />
                ) : (
                  <p className="p-6 text-sm text-slate-500">
                    No video timestamp available for this play.
                  </p>
                )}
                <div className="space-y-1 p-3">
                  <p className="font-semibold">
                    {label}
                    {hasTimestamp ? ` · ${timestamp(play.videoTimestamp)}` : ''}
                  </p>
                  <p className="text-xs text-slate-500">
                    {play.sessionLabel} · {play.date}
                  </p>
                  <Link className="text-sm underline" to={`/games/${play.gameId}`}>
                    {play.gameTitle}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
        {filtered.length > visible && (
          <button
            className="rounded-lg border px-4 py-2 text-sm font-semibold"
            onClick={() => setVisible((count) => count + 12)}
          >
            Show more plays
          </button>
        )}
      </section>
      <section className="space-y-3 rounded-xl border bg-white p-5">
        <h2 className="text-xl font-bold">Game history</h2>
        {!games.length && <p className="text-sm text-slate-600">No completed games yet.</p>}
        <ul className="space-y-2">
          {games.map((game) => (
            <li key={game.id}>
              <Link className="underline" to={`/games/${game.id}`}>
                {game.title}
              </Link>
              <span className="ml-2 text-sm text-slate-500">{game.date}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
