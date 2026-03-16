import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { env } from '../../../lib/env';
import { useAuthForm } from '../hooks/useAuthForm';
import { loginSchema } from '../schemas/authSchemas';

export function LoginForm({ redirectTo = '/feed' }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { values, onChange, submit, isSubmitting, error } = useAuthForm(
    { email: '', password: '' },
    loginSchema,
    async (payload) => {
      await login(payload);
      navigate(redirectTo);
    }
  );

  return (
    <form onSubmit={submit} className="space-y-4 rounded border bg-white p-4 shadow-sm">
      <h2 className="text-xl font-semibold">Login</h2>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <label className="block">
        <span className="mb-1 block text-sm">Email</span>
        <input
          className="w-full rounded border px-3 py-2"
          type="email"
          name="email"
          value={values.email}
          onChange={onChange}
          autoComplete="email"
          required
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm">Password</span>
        <input
          className="w-full rounded border px-3 py-2"
          type="password"
          name="password"
          value={values.password}
          onChange={onChange}
          autoComplete="current-password"
          required
        />
      </label>
      <button
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Logging in...' : 'Login'}
      </button>
      <div className="flex flex-col gap-1 text-sm">
        <Link className="text-blue-600 hover:underline" to="/forgot-password">
          Forgot password?
        </Link>
        <Link className="text-blue-600 hover:underline" to="/verify-email">
          Need a new verification email?
        </Link>
      </div>
      <a
        className="block text-sm text-blue-600 hover:underline"
        href={`${env.apiBaseUrl}/auth/google/start`}
      >
        Continue with Google
      </a>
      <p className="text-sm text-slate-600">
        Don&apos;t have an account?{' '}
        <Link
          className="text-blue-600 hover:underline"
          to={redirectTo ? `/register?redirectTo=${encodeURIComponent(redirectTo)}` : '/register'}
        >
          Create one
        </Link>
      </p>
    </form>
  );
}
