import { useQuery } from '@tanstack/react-query';
import { leaguesApi } from '../api/leaguesApi';

export function usePublicLeague(leagueSlug) {
  return useQuery({
    queryKey: ['publicLeague', leagueSlug],
    queryFn: () => leaguesApi.getPublicBySlug(leagueSlug),
    enabled: Boolean(leagueSlug),
    select: (response) => response.league,
  });
}
