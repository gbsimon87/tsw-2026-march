import { useEffect, useMemo, useRef } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { useAuth } from '../../app/store/AuthContext';
import { env } from '../../lib/env';
import { capturePostHogPageView, identifyPostHogUser, resetPostHogUser } from '../../lib/posthog';

const routePatterns = [
  '/',
  '/home',
  '/feed',
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
    plan: user.plan || 'free',
    roles: user.roles || [],
    emailVerified: Boolean(user.emailVerified),
    authProvider: user.authProvider || 'password',
    leaguePlan: user.leagueBilling?.plan || 'free',
    leagueSubscriptionStatus: user.leagueBilling?.subscriptionStatus || 'inactive',
  };
}

export function PostHogRouteTracker() {
  const location = useLocation();
  const { user, isLoading } = useAuth();
  const lastPageKeyRef = useRef('');
  const identifiedUserIdRef = useRef('');
  const routePattern = useMemo(() => getRoutePattern(location.pathname), [location.pathname]);

  useEffect(() => {
    const pageKey = `${location.pathname}${location.search}${location.hash}`;

    if (lastPageKeyRef.current === pageKey) {
      return;
    }

    lastPageKeyRef.current = pageKey;

    capturePostHogPageView({
      $current_url: window.location.href,
      path: location.pathname,
      search: location.search,
      url: window.location.href,
      referrer: document.referrer || '',
      app_env: env.appEnv,
      route_pattern: routePattern,
    });
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
