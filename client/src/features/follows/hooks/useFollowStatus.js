import { useQuery } from '@tanstack/react-query';
import { followsApi } from '../api/followsApi';

// Namespaced by targetType so a league id and a user id that happen to share the
// same 24-hex string never collide in the cache — the key must encode type once
// there is more than one.
export function followStatusQueryKey(targetType, targetIds) {
  return ['followStatus', targetType, [...targetIds].map(String).sort().join(',')];
}

// Batch "am I following?" for a set of target ids of one type (e.g. the follow
// buttons in the player-discovery grid). Disabled when there are no ids or the
// viewer is not signed in (only logged-in users can follow — decision D6).
export function useFollowStatus(targetIds, { targetType = 'user', enabled = true } = {}) {
  const ids = [...new Set((targetIds || []).filter(Boolean).map(String))];

  return useQuery({
    queryKey: followStatusQueryKey(targetType, ids),
    queryFn: () => followsApi.getStatuses(targetType, ids),
    enabled: enabled && ids.length > 0,
    select: (response) => response.statuses || {},
  });
}
