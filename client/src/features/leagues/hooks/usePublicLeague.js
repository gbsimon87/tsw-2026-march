import { useQuery } from '@tanstack/react-query';
import { leaguesApi } from '../api/leaguesApi';

export function usePublicLeague(leagueSlug, seasonId) {
  return useQuery({
    queryKey: ['publicLeague', leagueSlug, seasonId],
    queryFn: () => leaguesApi.getPublicBySlug(leagueSlug, seasonId),
    enabled: Boolean(leagueSlug),
    select: (response) => response.league,
  });
}
