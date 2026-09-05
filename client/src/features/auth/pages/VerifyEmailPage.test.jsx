import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { VerifyEmailPage } from './VerifyEmailPage';

vi.mock('../api/authApi', () => ({
  authApi: { verifyEmail: vi.fn(), requestVerification: vi.fn() },
}));

const { authApi } = await import('../api/authApi');

function renderAt(path) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/onboarding" element={<p>Onboarding</p>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.resetAllMocks());

describe('VerifyEmailPage', () => {
  test('verifies automatically when the url carries a token', async () => {
    authApi.verifyEmail.mockResolvedValue({ message: 'Email verified.' });

    renderAt('/verify-email?token=abc123');

    await waitFor(() => expect(authApi.verifyEmail).toHaveBeenCalledWith({ token: 'abc123' }));
  });

  test('lands the user on onboarding after verifying', async () => {
    authApi.verifyEmail.mockResolvedValue({ message: 'Email verified.' });

    renderAt('/verify-email?token=abc123');

    expect(await screen.findByText('Onboarding')).toBeInTheDocument();
  });

  test('verifies once despite StrictMode double-invocation', async () => {
    authApi.verifyEmail.mockResolvedValue({ message: 'Email verified.' });

    renderAt('/verify-email?token=abc123');

    await waitFor(() => expect(authApi.verifyEmail).toHaveBeenCalled());
    expect(authApi.verifyEmail).toHaveBeenCalledTimes(1);
  });

  test('does not auto-verify when there is no token', () => {
    renderAt('/verify-email');

    expect(authApi.verifyEmail).not.toHaveBeenCalled();
  });
});
