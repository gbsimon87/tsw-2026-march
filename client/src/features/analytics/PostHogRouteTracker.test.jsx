import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PostHogRouteTracker } from './PostHogRouteTracker';

const posthogLibMocks = vi.hoisted(() => ({
  initPostHog: vi.fn(),
  capturePostHogPageView: vi.fn(),
  capturePostHogPageLeave: vi.fn(),
  identifyPostHogUser: vi.fn(),
  resetPostHogUser: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  authState: {
    user: null,
    isLoading: false,
  },
}));

vi.mock('../../lib/posthog', () => posthogLibMocks);

vi.mock('../../app/store/AuthContext', () => ({
  useAuth: () => authMocks.authState,
}));

function TestRoutes() {
  return (
    <>
      <PostHogRouteTracker />
      <Routes>
        <Route
          path="/pulse"
          element={
            <div>
              <p>Feed</p>
              <Link to="/games/game-1?tab=replay">Game replay</Link>
            </div>
          }
        />
        <Route path="/games/:gameId" element={<p>Game detail</p>} />
      </Routes>
    </>
  );
}

function renderTracker(initialEntry = '/pulse') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <TestRoutes />
    </MemoryRouter>
  );
}

describe('PostHogRouteTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.authState = {
      user: null,
      isLoading: false,
    };
  });

  afterEach(() => {
    cleanup();
  });

  test('captures page views on initial render and SPA route changes', () => {
    renderTracker('/pulse');

    expect(posthogLibMocks.capturePostHogPageView).toHaveBeenCalledTimes(1);
    expect(posthogLibMocks.capturePostHogPageView).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: '/pulse',
        search: '',
        app_env: 'development',
        route_pattern: '/pulse',
      })
    );

    fireEvent.click(screen.getByRole('link', { name: 'Game replay' }));

    expect(posthogLibMocks.capturePostHogPageView).toHaveBeenCalledTimes(2);
    expect(posthogLibMocks.capturePostHogPageView).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: '/games/game-1',
        search: '?tab=replay',
        app_env: 'development',
        route_pattern: '/games/:gameId',
      })
    );
  });

  test('identifies authenticated users without sending email or name', () => {
    authMocks.authState = {
      isLoading: false,
      user: {
        id: 'user-1',
        email: 'alex@example.com',
        name: 'Alex',
        plan: 'team_pro',
        roles: ['user'],
        emailVerified: true,
        authProvider: 'google',
      },
    };

    renderTracker('/pulse');

    // Audit M7: leaguePlan/leagueSubscriptionStatus props were dropped (server no
    // longer serializes user.leagueBilling; they reported 'free' for everyone).
    expect(posthogLibMocks.identifyPostHogUser).toHaveBeenCalledWith('user-1', {
      plan: 'team_pro',
      roles: ['user'],
      emailVerified: true,
      authProvider: 'google',
    });
    expect(posthogLibMocks.identifyPostHogUser.mock.calls[0][1]).not.toHaveProperty('leaguePlan');
    expect(posthogLibMocks.identifyPostHogUser.mock.calls[0][1]).not.toHaveProperty('email');
    expect(posthogLibMocks.identifyPostHogUser.mock.calls[0][1]).not.toHaveProperty('name');
  });

  test('resets PostHog identity after an identified user logs out', () => {
    authMocks.authState = {
      isLoading: false,
      user: {
        id: 'user-1',
        plan: 'free',
        roles: ['user'],
      },
    };

    const { rerender } = render(
      <MemoryRouter initialEntries={['/pulse']}>
        <TestRoutes />
      </MemoryRouter>
    );

    expect(posthogLibMocks.identifyPostHogUser).toHaveBeenCalledWith('user-1', expect.any(Object));

    authMocks.authState = {
      isLoading: false,
      user: null,
    };

    rerender(
      <MemoryRouter initialEntries={['/pulse']}>
        <TestRoutes />
      </MemoryRouter>
    );

    expect(posthogLibMocks.resetPostHogUser).toHaveBeenCalledTimes(1);
  });
});
