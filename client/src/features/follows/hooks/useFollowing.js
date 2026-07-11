import { useQuery } from '@tanstack/react-query';
import { followsApi } from '../api/followsApi';

export const FOLLOWING_QUERY_KEY = ['following'];

// The current user's followed accounts. Auto-purged on auth transitions by
// AuthContext#purgePrivateCache (everything except ['auth','me']).
export function useFollowing() {
  return useQuery({
    queryKey: FOLLOWING_QUERY_KEY,
    queryFn: () => followsApi.listFollowing(),
    select: (response) => response.following || [],
  });
}
