import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const trackAuthPageViewedMock = vi.hoisted(() => vi.fn());
vi.mock('../../analytics/signupEvents', () => ({
  trackAuthPageViewed: trackAuthPageViewedMock,
  trackSignupCtaClicked: vi.fn(),
  SIGNUP_SOURCE: {},
}));

vi.mock('../components/LoginForm', () => ({
  LoginForm: ({ redirectTo }) => <div data-testid="login-form">{String(redirectTo)}</div>,
}));
vi.mock('../components/RegisterForm', () => ({
  RegisterForm: ({ redirectTo }) => <div data-testid="register-form">{String(redirectTo)}</div>,
}));

import { AuthPage } from './AuthPage';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('AuthPage redirect handling', () => {
  test('confirms a completed password reset on the login form', () => {
    renderAt('/login?passwordReset=1');

    expect(
      screen.getByText('Password reset successfully. Log in with your new password.')
    ).toBeInTheDocument();
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  test('keeps a same-origin path', () => {
    renderAt('/register?redirectTo=%2Fpulse%3Fcompose%3D1');

    expect(screen.getByTestId('register-form')).toHaveTextContent('/pulse?compose=1');
  });

  test.each([
    ['an absolute URL', 'https://evil.example.com/phish'],
    ['a protocol-relative URL', '//evil.example.com'],
    ['a javascript: URL', 'javascript:alert(1)'],
  ])('drops %s', (_label, value) => {
    renderAt(`/register?redirectTo=${encodeURIComponent(value)}`);

    // /register?redirectTo=… is the primary CTA from the nav, feed composer,
    // follow button, and pricing, so an unguarded value would make every one of
    // those an open-redirect vector.
    expect(screen.getByTestId('register-form')).toHaveTextContent('undefined');
  });
});

describe('AuthPage analytics', () => {
  test('records reaching the register form', () => {
    renderAt('/register');

    expect(trackAuthPageViewedMock).toHaveBeenCalledWith({
      mode: 'register',
      redirectTo: undefined,
    });
  });

  test('records reaching the login form', () => {
    renderAt('/login');

    expect(trackAuthPageViewedMock).toHaveBeenCalledWith({
      mode: 'login',
      redirectTo: undefined,
    });
  });

  test('reports a gated entry via redirectTo', () => {
    renderAt('/register?redirectTo=%2Fpulse');

    expect(trackAuthPageViewedMock).toHaveBeenCalledWith({
      mode: 'register',
      redirectTo: '/pulse',
    });
  });
});
