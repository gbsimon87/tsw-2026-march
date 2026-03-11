import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { authApi } from '../api/authApi';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();

    if (!token) {
      setError('Missing reset token in URL.');
      return;
    }

    setError('');
    setMessage('');
    setIsSubmitting(true);

    try {
      const result = await authApi.resetPassword({ token, newPassword });
      setMessage(result.message || 'Password reset successful. Please sign in again.');
      setNewPassword('');
    } catch (submitError) {
      setError(submitError.message || 'Unable to reset password.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-md">
      <form onSubmit={onSubmit} className="space-y-4 rounded border bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold">Reset Password</h2>
        <p className="text-sm text-slate-600">
          Use the reset link from your email to set a new password.
        </p>
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <label className="block">
          <span className="mb-1 block text-sm">New Password</span>
          <input
            className="w-full rounded border px-3 py-2"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <button
          className="rounded bg-slate-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Reset Password'}
        </button>
      </form>
    </section>
  );
}
