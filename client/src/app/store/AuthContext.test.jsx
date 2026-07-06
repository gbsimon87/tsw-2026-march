import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

const authApiMocks = vi.hoisted(() => ({
  me: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  googleExchange: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../../features/auth/api/authApi', () => ({
  authApi: authApiMocks,
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function AuthProbe() {
  const { user, loginWithGoogleExchange, logout } = useAuth();

  return (
    <div>
      <p data-testid="auth-state">{user ? user.email : 'logged-out'}</p>
      <button type="button" onClick={() => loginWithGoogleExchange('exchange-token')}>
        Exchange Google token
      </button>
      <button type="button" onClick={() => logout()}>
        Log out
      </button>
    </div>
  );
}

function renderWithQueryClient(children) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
  return { ...result, queryClient };
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test('does not let stale session hydration overwrite a completed Google exchange', async () => {
    const meRequest = deferred();
    authApiMocks.me.mockReturnValue(meRequest.promise);
    authApiMocks.googleExchange.mockResolvedValue({
      user: { id: 'user-1', email: 'alex@example.com', name: 'Alex' },
    });

    renderWithQueryClient(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Exchange Google token' }));

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('alex@example.com');
    });

    await act(async () => {
      meRequest.reject(new Error('Unauthorized'));
      await meRequest.promise.catch(() => {});
    });

    expect(screen.getByTestId('auth-state')).toHaveTextContent('alex@example.com');
  });

  test('does not let a stale but successful hydration overwrite a completed exchange', async () => {
    // The hydration request RESOLVES (not rejects) with a different, older
    // user after the exchange mutation already wrote the real one. This is
    // the path that must not return `undefined` from the queryFn — doing so
    // errors the query and silently logs the user back out.
    const meRequest = deferred();
    authApiMocks.me.mockReturnValue(meRequest.promise);
    authApiMocks.googleExchange.mockResolvedValue({
      user: { id: 'user-1', email: 'alex@example.com', name: 'Alex' },
    });

    renderWithQueryClient(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Exchange Google token' }));

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('alex@example.com');
    });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      meRequest.resolve({ user: { id: 'stale', email: 'stale@example.com', name: 'Stale' } });
      await meRequest.promise;
    });

    // The completed exchange wins; the stale hydration is discarded, and the
    // user is NOT flipped to logged-out.
    expect(screen.getByTestId('auth-state')).toHaveTextContent('alex@example.com');
    // ...and the queryFn must NOT have returned `undefined` (which React Query
    // logs+throws, corrupting the auth query into an error state).
    const loggedUndefinedError = consoleError.mock.calls.some((args) =>
      args.some((arg) => typeof arg === 'string' && arg.includes('Query data cannot be undefined'))
    );
    expect(loggedUndefinedError).toBe(false);
    consoleError.mockRestore();
  });

  test('purges other users cached data on logout but keeps the auth query', async () => {
    authApiMocks.me.mockResolvedValue({ user: { id: 'user-1', email: 'alex@example.com' } });
    authApiMocks.logout.mockResolvedValue({});

    const { queryClient } = renderWithQueryClient(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('alex@example.com');
    });

    // Seed a private, permission-scoped cache entry as if a page had loaded it.
    queryClient.setQueryData(['game', 'private-game-1'], { canDelete: true, secret: 'owner-only' });
    expect(queryClient.getQueryData(['game', 'private-game-1'])).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('logged-out');
    });

    // The previous user's private data must be gone; the auth query survives.
    expect(queryClient.getQueryData(['game', 'private-game-1'])).toBeUndefined();
    expect(queryClient.getQueryData(['auth', 'me'])).toBeNull();
  });
});
