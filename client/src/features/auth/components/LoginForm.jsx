import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { trackOauthStarted } from '../../analytics/signupEvents';
import { env } from '../../../lib/env';
import { useAuthForm } from '../hooks/useAuthForm';
import { loginSchema } from '../schemas/authSchemas';
import { FormField } from '../../../components/ui/FormField';
import { FormAlert } from './FormAlert';
import { getPostAuthDestination } from '../postAuthDestination';

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

export function LoginForm({ redirectTo }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { values, onChange, submit, isSubmitting, error, fieldErrors, isShaking } = useAuthForm(
    { email: '', password: '' },
    loginSchema,
    async (payload) => {
      const result = await login(payload);
      // A brand-new account goes to onboarding unless an explicit redirectTo
      // (a gated action the user was mid-way through) takes precedence.
      navigate(getPostAuthDestination(result.user, redirectTo));
    }
  );

  return (
    // noValidate: the app owns validation, so the browser's native tooltip
    // never pre-empts it. See RegisterForm.
    <form
      onSubmit={submit}
      noValidate
      className={`t-shake space-y-4 ${isShaking ? 'is-shaking' : ''}`}
    >
      <FormAlert message={error} />

      <FormField
        label="Email"
        name="email"
        type="email"
        value={values.email}
        onChange={onChange}
        error={fieldErrors.email}
        autoComplete="email"
        inputMode="email"
        required
      />

      <div>
        <FormField
          label="Password"
          name="password"
          type="password"
          value={values.password}
          onChange={onChange}
          error={fieldErrors.password}
          autoComplete="current-password"
          required
        />
        <p className="mt-1.5 text-right">
          <Link
            className="text-xs text-slate-500 transition-colors hover:text-slate-700"
            to="/forgot-password"
          >
            Forgot password?
          </Link>
        </p>
      </div>

      <button
        type="submit"
        aria-label="Log in"
        className="w-full rounded-lg bg-[#141414] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2a2a2a] active:bg-[#000] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Logging in…' : 'Log in'}
      </button>

      <div className="flex items-center gap-3">
        <hr className="flex-1 border-slate-100" />
        <span className="text-xs text-slate-400">or</span>
        <hr className="flex-1 border-slate-100" />
      </div>

      <a
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100"
        href={`${env.apiBaseUrl}/auth/google/start`}
        onClick={() => trackOauthStarted({ provider: 'google', mode: 'login' })}
      >
        <GoogleIcon />
        Continue with Google
      </a>

      <p className="text-center">
        <Link
          className="text-xs text-slate-500 transition-colors hover:text-slate-700"
          to="/verify-email"
        >
          Need a new verification email?
        </Link>
      </p>
    </form>
  );
}
