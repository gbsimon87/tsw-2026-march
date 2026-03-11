import { useState } from 'react';
import { authApi } from '../api/authApi';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);

    try {
      const result = await authApi.forgotPassword({ email });
      setMessage(
        result.message || 'If an account exists for that email, a reset link has been sent.'
      );
    } catch (submitError) {
      setError(submitError.message || 'Unable to request password reset.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-md">
      <form onSubmit={onSubmit} className="space-y-4 rounded border bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold">Forgot Password</h2>
        <p className="text-sm text-slate-600">Enter your email and we will send a reset link.</p>
        {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
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
          className="rounded bg-slate-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Send Reset Link'}
        </button>
      </form>
    </section>
  );
}
