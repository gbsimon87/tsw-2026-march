import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { useAuthForm } from '../hooks/useAuthForm';
import { registerSchema } from '../schemas/authSchemas';

export function RegisterForm({ redirectTo }) {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { values, onChange, submit, isSubmitting, error } = useAuthForm(
    { name: '', email: '', password: '' },
    registerSchema,
    async (payload) => {
      const result = await register(payload);
      if (result.verificationUrl) {
        window.location.assign(result.verificationUrl);
        return;
      }

      const next = redirectTo
        ? `/login?verifyEmail=1&redirectTo=${encodeURIComponent(redirectTo)}`
        : '/login?verifyEmail=1&redirectTo=%2Ffeed';
      navigate(next);
    }
  );

  return (
    <form onSubmit={submit} className="space-y-4 rounded border bg-white p-4 shadow-sm">
      <h2 className="text-xl font-semibold">Create Account</h2>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <label className="block">
        <span className="mb-1 block text-sm">Name</span>
        <input
          className="w-full rounded border px-3 py-2"
          type="text"
          name="name"
          value={values.name}
          onChange={onChange}
          autoComplete="name"
          required
        />
      </label>
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
          autoComplete="new-password"
          required
        />
      </label>
      <button
        className="rounded bg-emerald-700 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Creating account...' : 'Register'}
      </button>
      <p className="text-xs text-slate-500">
        New accounts must verify email before password login is enabled.
      </p>
      <p className="text-sm text-slate-600">
        Already have an account?{' '}
        <Link
          className="text-blue-600 hover:underline"
          to={
            redirectTo
              ? `/login?redirectTo=${encodeURIComponent(redirectTo)}`
              : '/login?redirectTo=%2Ffeed'
          }
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
