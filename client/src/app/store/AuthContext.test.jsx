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
  const { user, loginWithGoogleExchange } = useAuth();

  return (
    <div>
      <p data-testid="auth-state">{user ? user.email : 'logged-out'}</p>
      <button type="button" onClick={() => loginWithGoogleExchange('exchange-token')}>
        Exchange Google token
      </button>
    </div>
  );
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

    render(
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
});
