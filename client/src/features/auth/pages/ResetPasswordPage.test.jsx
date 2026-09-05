import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ResetPasswordPage } from './ResetPasswordPage';

vi.mock('../api/authApi', () => ({
  authApi: { resetPassword: vi.fn() },
}));

const { authApi } = await import('../api/authApi');

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('ResetPasswordPage', () => {
  test('redirects to local login after a successful password reset', async () => {
    authApi.resetPassword.mockResolvedValue({
      message: 'Password reset successful. Please sign in again.',
    });

    render(
      <MemoryRouter initialEntries={['/reset-password?token=reset-123']}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/login" element={<p>Local login</p>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'new-password-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(await screen.findByText('Local login')).toBeInTheDocument();
    expect(authApi.resetPassword).toHaveBeenCalledWith({
      token: 'reset-123',
      newPassword: 'new-password-123',
    });
  });
});
