import { useSearchParams } from 'react-router-dom';
import { LoginForm } from '../components/LoginForm';

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const shouldShowVerificationMessage = searchParams.get('verifyEmail') === '1';
  const redirectTo = searchParams.get('redirectTo') || undefined;
  const oauthError = searchParams.get('oauthError');

  return (
    <section className="mx-auto max-w-md space-y-3">
      {shouldShowVerificationMessage ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Registration successful. Check your inbox and verify your email before signing in.
        </p>
      ) : null}
      {oauthError === 'google_unavailable' ? (
        <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Google sign-in is not configured correctly for this environment yet.
        </p>
      ) : null}
      <LoginForm redirectTo={redirectTo} />
    </section>
  );
}
