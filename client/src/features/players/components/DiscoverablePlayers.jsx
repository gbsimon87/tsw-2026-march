import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { SportsLoader } from '../../../components/SportsLoader';
import { feedApi } from '../../feed/api/feedApi';
import { FollowButton } from '../../follows/components/FollowButton';
import { useFollowStatus } from '../../follows/hooks/useFollowStatus';
import { useAuth } from '../../../app/store/AuthContext';

const SEARCH_DEBOUNCE_MS = 400;

function useDebouncedValue(value, delayMs) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debouncedValue;
}

function PlayerInitials({ name }) {
  const initials = useMemo(
    () =>
      String(name || '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || 'P',
    [name]
  );

  return (
    <span
      aria-hidden="true"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#141414] bg-[#141414] text-sm font-semibold text-[#F4A300]"
      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
    >
      {initials}
    </span>
  );
}

export function DiscoverablePlayers({ limit = 24 }) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);

  const {
    data,
    isLoading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: ['discoverable-players', debouncedQuery, limit],
    queryFn: () => feedApi.listDiscoverablePlayers({ q: debouncedQuery || undefined, limit }),
  });

  const players = data?.players || [];

  // Batch-fetch follow status for every claimed result on the page in one
  // request instead of each card's FollowButton firing its own — otherwise a
  // 24-result page would fire 24 separate GET /follows/status calls.
  const claimedUserIds = useMemo(
    () => (data?.players || []).map((player) => player.claimedByUserId).filter(Boolean),
    [data]
  );
  const { data: followStatuses } = useFollowStatus(claimedUserIds, { enabled: Boolean(user) });
  const error = isError ? queryError?.message || 'Failed to load players' : '';

  return (
    <div aria-labelledby="discoverable-players-heading">
      <header className="gap-4 pb-4 md:flex md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
            Player discovery
          </p>
          <h2
            id="discoverable-players-heading"
            className="mt-1 text-2xl text-slate-900"
            style={{ fontFamily: "'Archivo Black', sans-serif" }}
          >
            Discover Players
          </h2>
          <p className="mt-3 max-w-2xl text-slate-600">
            Browse active players from public teams and public leagues.
          </p>
        </div>
        <label className="mt-4 block md:mt-0 md:w-72">
          <span className="sr-only">Search discoverable players</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search player, team, league"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#1B4332] focus:ring-2 focus:ring-[#1B4332]/20"
          />
        </label>
      </header>

      {isLoading ? (
        <SportsLoader label="Loading discoverable players" className="mt-4" />
      ) : error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700"
        >
          {error}
        </p>
      ) : players.length === 0 ? (
        <p
          role="status"
          className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm text-slate-600"
        >
          No public players found.
        </p>
      ) : (
        <ul className="mt-4 grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
          {players.map((player) => (
            <li key={`${player.source}-${player.id}`}>
              <div className="group flex h-full flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-[#F4A300]/60 hover:bg-white">
                <Link to={player.profileHref} className="flex gap-3">
                  <PlayerInitials name={player.displayName} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-slate-900 group-hover:text-[#1B4332]">
                        {player.displayName}
                      </span>
                      {player.jerseyNumber ? (
                        <span
                          className="text-xs font-semibold text-[#F4A300]"
                          style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                        >
                          #{player.jerseyNumber}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block truncate text-sm text-slate-600">
                      {player.team?.name || 'Unknown team'}
                    </span>
                    <span className="mt-1 inline-flex rounded-full text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {player.league?.name || player.sourceLabel}
                    </span>
                  </span>
                </Link>
                {player.claimedByUserId ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      to={`/players/${player.claimedByUserId}`}
                      className="text-xs font-semibold text-slate-500 underline decoration-[#F4A300] decoration-2 underline-offset-4 hover:text-[#1B4332]"
                    >
                      View full profile →
                    </Link>
                    <FollowButton
                      targetUserId={player.claimedByUserId}
                      size="compact"
                      knownIsFollowing={
                        user ? Boolean(followStatuses?.[player.claimedByUserId]) : undefined
                      }
                    />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
