import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useRef } from 'react';
import { authApi } from '../../features/auth/api/authApi';

const AuthContext = createContext(null);
export const AUTH_ME_QUERY_KEY = ['auth', 'me'];

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const authRevisionRef = useRef(0);

  const { data: user, isLoading } = useQuery({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: async () => {
      const hydrationRevision = authRevisionRef.current;
      try {
        const { user: currentUser } = await authApi.me();
        // A login/logout/register mutation can resolve and set the cache
        // while this hydration request is still in flight — the revision
        // check keeps the stale response from clobbering it. When the
        // revision moved on, keep whatever the mutation already wrote
        // (never return `undefined` — React Query treats that as an error
        // and would flip the auth query into an error state, which the
        // `null`-fallback below would then read as "logged out").
        if (authRevisionRef.current !== hydrationRevision) {
          return queryClient.getQueryData(AUTH_ME_QUERY_KEY) ?? null;
        }
        return currentUser ?? null;
      } catch {
        if (authRevisionRef.current !== hydrationRevision) {
          return queryClient.getQueryData(AUTH_ME_QUERY_KEY) ?? null;
        }
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const value = useMemo(() => {
    // Purge every cached query EXCEPT the auth session itself. The
    // QueryClient is a persistent app-wide singleton, so on any auth
    // transition (login as a different user, logout) the prior user's
    // cached — potentially permission-scoped — data must not linger in
    // memory for the next user to read. We exclude the `['auth','me']`
    // key so we don't disturb this component's live observer (removing
    // it would trigger an immediate, unwanted `/auth/me` refetch); the
    // caller sets the fresh auth value right after.
    const purgePrivateCache = () => {
      queryClient.removeQueries({
        predicate: (query) => {
          const [scope, sub] = query.queryKey;
          return !(scope === AUTH_ME_QUERY_KEY[0] && sub === AUTH_ME_QUERY_KEY[1]);
        },
      });
    };

    return {
      user: user ?? null,
      isLoading,
      async login(payload) {
        const result = await authApi.login(payload);
        authRevisionRef.current += 1;
        purgePrivateCache();
        queryClient.setQueryData(AUTH_ME_QUERY_KEY, result.user);
        return result;
      },
      async register(payload) {
        const result = await authApi.register(payload);
        authRevisionRef.current += 1;
        purgePrivateCache();
        queryClient.setQueryData(AUTH_ME_QUERY_KEY, null);
        return result;
      },
      async loginWithGoogleExchange(token) {
        const result = await authApi.googleExchange(token);
        authRevisionRef.current += 1;
        purgePrivateCache();
        queryClient.setQueryData(AUTH_ME_QUERY_KEY, result.user);
        return result;
      },
      async logout() {
        await authApi.logout();
        authRevisionRef.current += 1;
        purgePrivateCache();
        queryClient.setQueryData(AUTH_ME_QUERY_KEY, null);
      },
      updateUser(updatedUser) {
        queryClient.setQueryData(AUTH_ME_QUERY_KEY, updatedUser);
      },
    };
  }, [isLoading, user, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
