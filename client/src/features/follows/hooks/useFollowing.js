import { useQuery } from '@tanstack/react-query';
import { followsApi } from '../api/followsApi';

// The following list is paginated per target type server-side, so the client
// queries one type at a time (FollowingPage fires one per section). Keys are
// namespaced by type; all are auto-purged on auth transitions by
// AuthContext#purgePrivateCache (everything except ['auth','me']).
export function followingQueryKey(targetType) {
  return ['following', targetType];
}

export function useFollowing(targetType = 'user') {
  return useQuery({
    queryKey: followingQueryKey(targetType),
    queryFn: () => followsApi.listFollowing(targetType),
    select: (response) => response.following || [],
  });
}
