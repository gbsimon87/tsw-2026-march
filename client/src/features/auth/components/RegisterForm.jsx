import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { env } from '../../../lib/env';
import { useAuthForm } from '../hooks/useAuthForm';
import { registerSchema } from '../schemas/authSchemas';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.017 17.64 11.71 17.64 8.97z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-[#F4A300]/60 focus:outline-none focus:ring-2 focus:ring-[#F4A300]/20';

export function RegisterForm({ redirectTo, onRegistered, onSwitchToLogin }) {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { values, onChange, submit, isSubmitting, error } = useAuthForm(
    { name: '', email: '', password: '' },
    registerSchema,
    async (payload) => {
      await register(payload);
      if (onRegistered) {
        onRegistered();
      } else {
        const next = redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login';
        navigate(next);
      }
    }
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div>
        <label htmlFor="register-name" className="mb-1.5 block text-sm font-medium text-slate-700">
          Name
        </label>
        <input
          id="register-name"
          className={inputClass}
          type="text"
          name="name"
          value={values.name}
          onChange={onChange}
          autoComplete="name"
          required
        />
      </div>

      <div>
        <label htmlFor="register-email" className="mb-1.5 block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="register-email"
          className={inputClass}
          type="email"
          name="email"
          value={values.email}
          onChange={onChange}
          autoComplete="email"
          required
        />
      </div>

      <div>
        <label
          htmlFor="register-password"
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          Password
        </label>
        <input
          id="register-password"
          className={inputClass}
          type="password"
          name="password"
          value={values.password}
          onChange={onChange}
          autoComplete="new-password"
          required
        />
      </div>

      <button
        type="submit"
        aria-label="Create account"
        className="w-full rounded-lg bg-[#141414] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1B4332] active:bg-[#123328] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </button>

      <div className="flex items-center gap-3">
        <hr className="flex-1 border-slate-100" />
        <span className="text-xs text-slate-400">or</span>
        <hr className="flex-1 border-slate-100" />
      </div>

      <a
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100"
        href={`${env.apiBaseUrl}/auth/google/start`}
      >
        <GoogleIcon />
        Continue with Google
      </a>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <button
          type="button"
          aria-label="Log in"
          className="font-medium text-slate-700 underline-offset-2 hover:underline"
          onClick={onSwitchToLogin}
        >
          Log in
        </button>
      </p>
    </form>
  );
}
