import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../app/store/AuthContext';
import { CONSENT_ACCEPTED, onConsentChange } from '../../lib/consent';
import {
  capturePostHogPageLeave,
  capturePostHogPageView,
  identifyPostHogUser,
  initPostHog,
  resetPostHogUser,
  setPostHogCommonContext,
} from '../../lib/posthog';
import { useScrollDepth } from './useScrollDepth';
import { getRoutePattern } from './routePatterns';

function getSafeUserProperties(user) {
  return {
    auth_provider: user.authProvider === 'google' ? 'google' : 'local',
    email_verified: Boolean(user.emailVerified),
    onboarding_status: user.onboarding?.status || 'completed',
    onboarding_roles: user.onboarding?.roles || [],
    is_internal: Boolean(user.isInternal),
  };
}

export function PostHogRouteTracker() {
  const location = useLocation();
  const { user, isLoading } = useAuth();
  const activePageRef = useRef(null);
  const maxScrollDepthRef = useRef(0);
  const identifiedUserIdRef = useRef('');
  const [consentRevision, setConsentRevision] = useState(0);
  const routePattern = useMemo(() => getRoutePattern(location.pathname), [location.pathname]);
  const routeKey = location.pathname;

  const onScrollDepthReached = useCallback((depth) => {
    maxScrollDepthRef.current = Math.max(maxScrollDepthRef.current, depth);
  }, []);

  useScrollDepth(onScrollDepthReached, routeKey);

  useEffect(
    () =>
      onConsentChange((decision) => {
        if (decision !== CONSENT_ACCEPTED) activePageRef.current = null;
        setConsentRevision((value) => value + 1);
      }),
    []
  );

  const leaveActivePage = useCallback(() => {
    const page = activePageRef.current;
    if (!page || page.left) return;
    page.left = true;
    capturePostHogPageLeave({
      ...page.properties,
      duration_seconds: Math.max(0, (performance.now() - page.startedAt) / 1000),
      max_scroll_depth: maxScrollDepthRef.current,
    });
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', leaveActivePage);
    return () => window.removeEventListener('pagehide', leaveActivePage);
  }, [leaveActivePage]);

  useEffect(() => {
    // Init here (after first paint, before the first capture) rather than at
    // module load, so the posthog chunk never blocks initial render (OPT-001).
    // idempotent — safe to call on every route change.
    initPostHog();

    const pageKey = location.pathname;

    if (activePageRef.current?.key === pageKey) {
      return;
    }

    leaveActivePage();

    maxScrollDepthRef.current = 0;

    const pageProps = {
      route_pattern: routePattern,
      is_authenticated: Boolean(user?.id),
    };

    if (capturePostHogPageView(pageProps)) {
      activePageRef.current = {
        key: pageKey,
        properties: pageProps,
        startedAt: performance.now(),
        left: false,
      };
    } else {
      activePageRef.current = null;
    }
  }, [consentRevision, leaveActivePage, location.pathname, routePattern, user?.id]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (user?.id) {
      if (identifiedUserIdRef.current && identifiedUserIdRef.current !== user.id) {
        resetPostHogUser();
        identifiedUserIdRef.current = '';
      }
      setPostHogCommonContext({
        isAuthenticated: true,
        isInternal: user.isInternal,
        isDemo: user.isDemo,
      });
      // Only record the id once identify actually happened. identifyPostHogUser
      // is a no-op before consent, and setting the ref regardless would make
      // the consentRevision re-run below think the work was already done —
      // leaving a signed-in user anonymous for the rest of the session.
      if (identifyPostHogUser(user.id, getSafeUserProperties(user))) {
        identifiedUserIdRef.current = user.id;
      }
      return;
    }

    if (identifiedUserIdRef.current) {
      identifiedUserIdRef.current = '';
      resetPostHogUser();
    }
    setPostHogCommonContext({ isAuthenticated: false, isInternal: false, isDemo: false });
    // consentRevision re-runs this after the visitor accepts, so someone
    // already signed in is identified without needing a page reload.
  }, [isLoading, user, consentRevision]);

  return null;
}
