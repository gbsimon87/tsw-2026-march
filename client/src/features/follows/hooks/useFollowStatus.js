import { useQuery } from '@tanstack/react-query';
import { followsApi } from '../api/followsApi';

export function followStatusQueryKey(userIds) {
  return ['followStatus', [...userIds].map(String).sort().join(',')];
}

// Batch "am I following?" for a set of user ids (e.g. the follow buttons in the
// player-discovery grid). Disabled when there are no ids or the viewer is not
// signed in (only logged-in users can follow — decision D6).
export function useFollowStatus(userIds, { enabled = true } = {}) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];

  return useQuery({
    queryKey: followStatusQueryKey(ids),
    queryFn: () => followsApi.getStatuses(ids),
    enabled: enabled && ids.length > 0,
    select: (response) => response.statuses || {},
  });
}
