import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { authApi } from '../api/authApi';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onVerifyToken(event) {
    event.preventDefault();

    if (!token) {
      setError('Missing verification token in URL.');
      return;
    }

    setError('');
    setMessage('');
    setIsSubmitting(true);

    try {
      const result = await authApi.verifyEmail({ token });
      setMessage(result.message || 'Email verified. You can now sign in.');
    } catch (submitError) {
      setError(submitError.message || 'Unable to verify email.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onRequestNew(event) {
    event.preventDefault();

    setError('');
    setMessage('');
    setIsSubmitting(true);

    try {
      const result = await authApi.requestVerification({ email });
      setMessage(
        result.message || 'If an account exists for that email, a verification link has been sent.'
      );
    } catch (submitError) {
      setError(submitError.message || 'Unable to request verification email.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-md space-y-4">
      <form onSubmit={onVerifyToken} className="space-y-4 rounded border bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold">Verify Email</h2>
        <p className="text-sm text-slate-600">
          Open this page from your email link, then confirm verification.
        </p>
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          className="rounded bg-slate-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={isSubmitting || !token}
        >
          {isSubmitting ? 'Submitting...' : 'Verify Email'}
        </button>
      </form>

      <form onSubmit={onRequestNew} className="space-y-4 rounded border bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold">Request New Verification Link</h3>
        <label className="block">
          <span className="mb-1 block text-sm">Email</span>
          <input
            className="w-full rounded border px-3 py-2"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <button
          className="rounded bg-emerald-700 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Send Verification Email'}
        </button>
      </form>
    </section>
  );
}
