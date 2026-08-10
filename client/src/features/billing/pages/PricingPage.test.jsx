import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PricingPage } from './PricingPage';

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ user: { id: 'user-1' } })),
}));

const billingApiMocks = vi.hoisted(() => ({
  getCatalog: vi.fn(),
  createTeamCheckoutSession: vi.fn(),
  createLeagueCheckoutSession: vi.fn(),
  createCustomerPortalSession: vi.fn(),
}));

const teamsApiMocks = vi.hoisted(() => ({
  list: vi.fn(),
}));

const leaguesApiMocks = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock('../../../app/store/AuthContext', () => ({
  useAuth: authMocks.useAuth,
}));

vi.mock('../api/billingApi', () => ({
  billingApi: billingApiMocks,
}));

vi.mock('../../teams/api/teamsApi', () => ({
  teamsApi: teamsApiMocks,
}));

vi.mock('../../leagues/api/leaguesApi', () => ({
  leaguesApi: leaguesApiMocks,
}));

// Mirrors GET /billing/catalog (getDisplayCatalog) — no price IDs, display copy only.
const CATALOG = {
  plans: [
    {
      id: 'starter',
      scope: 'team',
      name: 'Starter',
      tagline: 'Track one team, free forever.',
      price: 'Free',
      features: ['Live stat tracking & box scores', 'Public team & player pages'],
      intervals: {},
    },
    {
      id: 'team_pro',
      scope: 'team',
      name: 'Team Pro',
      tagline: 'Depth for serious teams.',
      features: ['Everything in Starter', 'Replay & public shot maps'],
      intervals: {
        monthly: { display: '$9/mo', trialDays: 14 },
        season: { display: '$79/yr', trialDays: 14 },
      },
    },
    {
      id: 'league',
      scope: 'league',
      name: 'League',
      tagline: 'Run your whole league.',
      features: ['Team Pro included for every team', 'Standings, rosters & join requests'],
      intervals: {
        monthly: { display: '$29/mo', trialDays: 14 },
        season: { display: '$199/season', trialDays: 14 },
      },
    },
  ],
};

function renderPricing(initialEntry = '/pricing') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/register" element={<div>Register page</div>} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PricingPage', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.useAuth.mockReturnValue({ user: { id: 'user-1' } });
    billingApiMocks.getCatalog.mockResolvedValue(CATALOG);
    teamsApiMocks.list.mockResolvedValue({
      teams: [
        {
          id: 'team-free',
          name: 'Free Team',
          billing: { plan: 'starter', subscriptionStatus: 'inactive' },
        },
        {
          id: 'team-active',
          name: 'Active Team',
          billing: { plan: 'team_pro', subscriptionStatus: 'active' },
        },
      ],
    });
    leaguesApiMocks.list.mockResolvedValue({ leagues: [] });
    billingApiMocks.createTeamCheckoutSession.mockResolvedValue({
      url: 'https://checkout.stripe.com/test',
    });
    billingApiMocks.createLeagueCheckoutSession.mockResolvedValue({
      url: 'https://checkout.stripe.com/league-test',
    });
    billingApiMocks.createCustomerPortalSession.mockResolvedValue({
      url: 'https://billing.stripe.com/portal-test',
    });
    delete window.location;
    window.location = { ...originalLocation, assign: vi.fn() };
  });

  afterEach(() => {
    cleanup();
    window.location = originalLocation;
  });

  test('renders the three catalog plans', async () => {
    renderPricing();
    expect(await screen.findByText(/^Starter$/)).toBeInTheDocument();
    expect(screen.getByText(/^Team Pro$/)).toBeInTheDocument();
    expect(screen.getByText(/^League$/)).toBeInTheDocument();
  });

  test('renders catalog prices and toggles interval', async () => {
    renderPricing();
    await waitFor(() => expect(screen.getByText(/\$9\/mo/)).toBeInTheDocument());
    expect(screen.getByText(/\$29\/mo/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Season/i }));

    expect(screen.getByText(/\$79\/yr/)).toBeInTheDocument();
    expect(screen.getByText(/\$199\/season/)).toBeInTheDocument();
    expect(screen.queryByText(/\$9\/mo/)).not.toBeInTheDocument();
  });

  test('starts team checkout for a free team', async () => {
    renderPricing();

    await waitFor(() => {
      expect(screen.getByText(/free team/i)).toBeInTheDocument();
    });

    // Team Pro + League cards both show "Start free trial"; click the first (Team).
    fireEvent.click(screen.getAllByRole('button', { name: /Start free trial/i })[0]);

    await waitFor(() => {
      expect(billingApiMocks.createTeamCheckoutSession).toHaveBeenCalledWith(
        'team-free',
        'monthly'
      );
    });
    expect(window.location.assign).toHaveBeenCalledWith('https://checkout.stripe.com/test');
  });

  test('opens the billing portal for an active (canonical team_pro) team', async () => {
    renderPricing('/pricing?teamId=team-active');

    await waitFor(() => {
      expect(screen.getByText(/active team/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Manage Team Billing/i }));

    await waitFor(() => {
      expect(billingApiMocks.createCustomerPortalSession).toHaveBeenCalledWith({
        teamId: 'team-active',
      });
    });
    expect(window.location.assign).toHaveBeenCalledWith('https://billing.stripe.com/portal-test');
  });

  test('unauthenticated user sees register link for the paid plans', async () => {
    authMocks.useAuth.mockReturnValue({ user: null });
    renderPricing();

    const registerLinks = await screen.findAllByRole('link', { name: /Start free trial/i });
    expect(registerLinks.length).toBeGreaterThan(0);
    expect(registerLinks[0]).toHaveAttribute('href', expect.stringContaining('/register'));
  });
});
