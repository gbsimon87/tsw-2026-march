import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../app/store/AuthContext';
import { CONSENT_ACCEPTED, onConsentChange } from '../../lib/consent';
import {
  capturePostHogPageLeave,
  capturePostHogPageView,
  identifyPostHogUser,
  initPostHog,
  registerPostHogAttribution,
  resetPostHogUser,
  setPostHogCommonContext,
} from '../../lib/posthog';
import { useScrollDepth } from './useScrollDepth';
import {
  attributionProperties,
  captureFirstTouch,
  isCampaignLanding,
  persistFirstTouchOnConsent,
} from './attribution';
import { trackEvent } from './trackEvent';
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
  const landingReportedRef = useRef(false);
  const routePattern = useMemo(() => getRoutePattern(location.pathname), [location.pathname]);
  const routeKey = location.pathname;

  // Social backlog rank 5. Read during the FIRST render, not in an effect: an
  // effect runs after the router has had a chance to redirect, and a redirect
  // replaces the URL — taking `?utm_source=instagram` with it. Reading the
  // current URL costs no storage, so this needs no consent decision; only
  // persisting it does, which captureFirstTouch gates for itself.
  const [firstTouch] = useState(() => captureFirstTouch());

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

    // Social backlog rank 5. Register before the pageview so the very first
    // event of an attributed session already carries its channel. Both calls
    // are no-ops until PostHog is initialised and consented, and re-running
    // them after a consent change is how an accepted visitor gets attributed
    // without a reload.
    const attribution = attributionProperties(firstTouch);
    if (attribution) {
      registerPostHogAttribution(attribution);
      persistFirstTouchOnConsent();
    }

    if (capturePostHogPageView(pageProps)) {
      activePageRef.current = {
        key: pageKey,
        properties: pageProps,
        startedAt: performance.now(),
        left: false,
      };

      // Once per session, on the page the visitor actually arrived at. A second
      // landing event from a later route would make the funnel's first step
      // count navigations instead of arrivals.
      if (!landingReportedRef.current && isCampaignLanding(firstTouch)) {
        landingReportedRef.current = true;
        trackEvent('social_landing_viewed', {
          ...attribution,
          is_tagged: firstTouch.is_tagged,
          route_pattern: routePattern,
        });
      }
    } else {
      activePageRef.current = null;
    }
  }, [consentRevision, firstTouch, leaveActivePage, location.pathname, routePattern, user?.id]);

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
      // Attribution goes in the $set_once bag: the channel that first found
      // this person is fixed, however they arrive in later sessions.
      if (
        identifyPostHogUser(
          user.id,
          getSafeUserProperties(user),
          attributionProperties(firstTouch) || undefined
        )
      ) {
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
  }, [isLoading, user, consentRevision, firstTouch]);

  return null;
}
