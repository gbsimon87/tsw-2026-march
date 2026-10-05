import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { videoApi } from '../api/videoApi';
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;
export function useVideoPlayback({
  gameId,
  eventId = null,
  version = null,
  enabled = false,
  beforeRefresh,
}) {
  const client = useQueryClient();
  const viewer = useSyncExternalStore(
    (listener) =>
      client.getQueryCache().subscribe((event) => {
        if (event.query.queryKey[0] === 'auth' && event.query.queryKey[1] === 'me') listener();
      }),
    () => client.getQueryData(['auth', 'me'])?.id ?? 'anonymous'
  );
  const callback = useRef(beforeRefresh);
  callback.current = beforeRefresh;
  const query = useQuery({
    queryKey: ['videoPlayback', viewer, gameId, eventId ?? 'full', version],
    queryFn: () => {
      callback.current?.();
      return videoApi.getPlayback(gameId, eventId);
    },
    enabled: Boolean(gameId) && enabled,
    retry: (count, error) => count < 2 && ![401, 403, 404, 422].includes(error.status),
    gcTime: 0,
    staleTime: 0,
    refetchOnMount: 'always',
    // V2: every new token makes the player reload its source (rebuffering,
    // and the tracker clock drifting from the video). Renewal is driven only
    // by expiry: the interval below and the visibility `wake` check.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchIntervalInBackground: false,
    refetchInterval: (q) => {
      if (!enabled || q.state.status === 'error') return false;
      const expires = Date.parse(q.state.data?.expiresAt ?? '');
      return Number.isFinite(expires)
        ? Math.max(1000, expires - Date.now() - REFRESH_MARGIN_MS)
        : false;
    },
  });
  const { refetch } = query;
  useEffect(() => {
    if (!enabled) return undefined;
    const wake = () => {
      const expires = Date.parse(
        client.getQueryData(['videoPlayback', viewer, gameId, eventId ?? 'full', version])
          ?.expiresAt ?? ''
      );
      if (
        document.visibilityState === 'visible' &&
        (!Number.isFinite(expires) || expires - Date.now() <= REFRESH_MARGIN_MS)
      )
        refetch();
    };
    document.addEventListener('visibilitychange', wake);
    return () => document.removeEventListener('visibilitychange', wake);
  }, [enabled, client, viewer, gameId, eventId, version, refetch]);
  return { ...query, viewer };
}
