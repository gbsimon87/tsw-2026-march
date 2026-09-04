import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { readPendingFollowIntent } from '../../follows/followIntent';
import { getPostAuthDestination } from '../postAuthDestination';

export function GoogleCompletePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithGoogleExchange } = useAuth();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const token = searchParams.get('token');
    if (!token) {
      navigate('/login?oauthError=google_unavailable', { replace: true });
      return;
    }

    loginWithGoogleExchange(token)
      .then((result) => {
        const followReturnTo = readPendingFollowIntent()?.returnTo;
        navigate(getPostAuthDestination(result.user, followReturnTo), { replace: true });
      })
      .catch(() => navigate('/login?oauthError=google_unavailable', { replace: true }));
  }, [loginWithGoogleExchange, navigate, searchParams]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="text-sm text-slate-500">Completing sign-in…</p>
    </div>
  );
}
