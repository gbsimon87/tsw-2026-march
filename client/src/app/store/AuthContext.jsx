import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authApi } from '../../features/auth/api/authApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const authRevisionRef = useRef(0);

  useEffect(() => {
    const hydrationRevision = authRevisionRef.current;

    authApi
      .me()
      .then(({ user: currentUser }) => {
        if (authRevisionRef.current === hydrationRevision) {
          setUser(currentUser);
        }
      })
      .catch(() => {
        if (authRevisionRef.current === hydrationRevision) {
          setUser(null);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      async login(payload) {
        const result = await authApi.login(payload);
        authRevisionRef.current += 1;
        setUser(result.user);
        return result;
      },
      async register(payload) {
        const result = await authApi.register(payload);
        authRevisionRef.current += 1;
        setUser(null);
        return result;
      },
      async loginWithGoogleExchange(token) {
        const result = await authApi.googleExchange(token);
        authRevisionRef.current += 1;
        setUser(result.user);
        return result;
      },
      async logout() {
        await authApi.logout();
        authRevisionRef.current += 1;
        setUser(null);
      },
      updateUser(updatedUser) {
        setUser(updatedUser);
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
