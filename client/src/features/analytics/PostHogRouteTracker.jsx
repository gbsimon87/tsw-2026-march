import { useCallback, useEffect, useMemo, useRef } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { useAuth } from '../../app/store/AuthContext';
import { env } from '../../lib/env';
import {
  capturePostHogPageLeave,
  capturePostHogPageView,
  identifyPostHogUser,
  initPostHog,
  resetPostHogUser,
} from '../../lib/posthog';
import { useScrollDepth } from './useScrollDepth';

const routePatterns = [
  '/',
  '/home',
  '/pulse',
  '/login',
  '/register',
  '/auth/google/complete',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/league/:leagueSlug',
  '/league/:leagueSlug/standings',
  '/league/:leagueSlug/games',
  '/league/:leagueSlug/teams/:teamSlug',
  '/league/:leagueSlug/teams/:teamSlug/players/:leaguePlayerId',
  '/teams',
  '/teams/new',
  '/teams/:teamId/edit',
  '/teams/:teamId/players/:playerId',
  '/teams/:teamId',
  '/opponents/:opponentSlug',
  '/admin',
  '/dashboard',
  '/admin/leagues/new',
  '/admin/leagues/:leagueId',
  '/admin/leagues/:leagueId/teams/:leagueTeamId',
  '/admin/leagues/:leagueId/games/new',
  '/games',
  '/games/new',
  '/games/:gameId/track',
  '/games/:gameId',
];

function getRoutePattern(pathname) {
  const match = routePatterns.find((pattern) => matchPath({ path: pattern, end: true }, pathname));

  return match || pathname;
}

function getSafeUserProperties(user) {
  return {
    // Audit M7: the server sends canonical plan ids ('starter'/'team_pro') and no
    // longer serializes user.leagueBilling (dropped in T-25), so the old
    // leaguePlan/leagueSubscriptionStatus props reported 'free' for every user.
    // Drop them and use the canonical fallback.
    plan: user.plan || 'starter',
    roles: user.roles || [],
    emailVerified: Boolean(user.emailVerified),
    authProvider: user.authProvider || 'password',
  };
}

export function PostHogRouteTracker() {
  const location = useLocation();
  const { user, isLoading } = useAuth();
  const lastPageKeyRef = useRef('');
  const lastPagePropsRef = useRef(null);
  const maxScrollDepthRef = useRef(0);
  const identifiedUserIdRef = useRef('');
  const routePattern = useMemo(() => getRoutePattern(location.pathname), [location.pathname]);
  const routeKey = `${location.pathname}${location.search}`;

  const onScrollDepthReached = useCallback((depth) => {
    maxScrollDepthRef.current = Math.max(maxScrollDepthRef.current, depth);
  }, []);

  useScrollDepth(onScrollDepthReached, routeKey);

  useEffect(() => {
    // Init here (after first paint, before the first capture) rather than at
    // module load, so the posthog chunk never blocks initial render (OPT-001).
    // idempotent — safe to call on every route change.
    initPostHog();

    const pageKey = `${location.pathname}${location.search}${location.hash}`;

    if (lastPageKeyRef.current === pageKey) {
      return;
    }

    if (lastPagePropsRef.current) {
      capturePostHogPageLeave({
        ...lastPagePropsRef.current,
        scroll_depth: maxScrollDepthRef.current,
      });
    }

    lastPageKeyRef.current = pageKey;
    maxScrollDepthRef.current = 0;

    const pageProps = {
      $current_url: window.location.href,
      path: location.pathname,
      search: location.search,
      url: window.location.href,
      referrer: document.referrer || '',
      app_env: env.appEnv,
      route_pattern: routePattern,
    };

    lastPagePropsRef.current = pageProps;
    capturePostHogPageView(pageProps);
  }, [location.hash, location.pathname, location.search, routePattern]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (user?.id) {
      identifiedUserIdRef.current = user.id;
      identifyPostHogUser(user.id, getSafeUserProperties(user));
      return;
    }

    if (identifiedUserIdRef.current) {
      identifiedUserIdRef.current = '';
      resetPostHogUser();
    }
  }, [isLoading, user]);

  return null;
}
