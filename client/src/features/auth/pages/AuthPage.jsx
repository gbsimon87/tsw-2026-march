import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { LoginForm } from '../components/LoginForm';
import { RegisterForm } from '../components/RegisterForm';

export function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isRegister = location.pathname === '/register';
  const redirectTo = searchParams.get('redirectTo') || undefined;
  const verifyEmail = searchParams.get('verifyEmail') === '1';
  const registered = searchParams.get('registered') === '1';
  const oauthError = searchParams.get('oauthError');

  function buildQuery(extra = {}) {
    const sp = new URLSearchParams();
    if (redirectTo) sp.set('redirectTo', redirectTo);
    Object.entries(extra).forEach(([k, v]) => sp.set(k, v));
    const qs = sp.toString();
    return qs ? `?${qs}` : '';
  }

  function goToLogin(extra = {}) {
    navigate(`/login${buildQuery(extra)}`, { replace: true });
  }

  function goToRegister() {
    navigate(`/register${buildQuery()}`, { replace: true });
  }

  function handleRegistered() {
    goToLogin({ registered: '1' });
  }

  return (
    <div className="mx-auto max-w-sm py-10">
      <div className="mb-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#F4A300]">
          The Sporty Way
        </p>
        <h1
          className="mt-2 text-3xl text-slate-900"
          style={{ fontFamily: "'Archivo Black', sans-serif" }}
        >
          {isRegister ? 'Join the roster.' : 'Welcome back.'}
        </h1>
      </div>

      {verifyEmail ? (
        <p className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Check your inbox and verify your email before signing in.
        </p>
      ) : null}
      {registered ? (
        <p className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Account created — you can now log in.
        </p>
      ) : null}
      {oauthError === 'google_unavailable' ? (
        <p className="mb-4 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Google sign-in isn&apos;t configured for this environment yet.
        </p>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-7 flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => goToLogin()}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-all ${
              !isRegister
                ? 'bg-[#141414] text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={goToRegister}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-all ${
              isRegister
                ? 'bg-[#141414] text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Sign up
          </button>
        </div>

        {isRegister ? (
          <RegisterForm
            redirectTo={redirectTo}
            onRegistered={handleRegistered}
            onSwitchToLogin={() => goToLogin()}
          />
        ) : (
          <LoginForm redirectTo={redirectTo} onSwitchToRegister={goToRegister} />
        )}
      </div>
    </div>
  );
}
