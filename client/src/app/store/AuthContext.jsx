import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../../features/auth/api/authApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    authApi
      .me()
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      async login(payload) {
        const result = await authApi.login(payload);
        setUser(result.user);
        return result;
      },
      async register(payload) {
        const result = await authApi.register(payload);
        setUser(null);
        return result;
      },
      async loginWithGoogleExchange(token) {
        const result = await authApi.googleExchange(token);
        setUser(result.user);
        return result;
      },
      async logout() {
        await authApi.logout();
        setUser(null);
      },
    }),
    [isLoading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
