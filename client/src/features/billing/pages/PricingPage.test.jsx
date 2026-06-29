import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PricingPage } from './PricingPage';

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ user: { id: 'user-1' } })),
}));

const billingApiMocks = vi.hoisted(() => ({
  createTeamCheckoutSession: vi.fn(),
  createLeagueCheckoutSession: vi.fn(),
  createCustomerPortalSession: vi.fn(),
  createCheckoutSession: vi.fn(),
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
    teamsApiMocks.list.mockResolvedValue({
      teams: [
        {
          id: 'team-free',
          name: 'Free Team',
          billing: { plan: 'free', subscriptionStatus: 'inactive' },
        },
        {
          id: 'team-active',
          name: 'Active Team',
          billing: { plan: 'team', subscriptionStatus: 'active' },
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

  test('starts team checkout for a free team', async () => {
    renderPricing();

    await waitFor(() => {
      expect(screen.getByText(/free team/i)).toBeInTheDocument();
    });

    // Both Team and League cards show "Start 14-day Trial"; click the first (Team card)
    fireEvent.click(screen.getAllByRole('button', { name: /Start 14-day Trial/i })[0]);

    await waitFor(() => {
      expect(billingApiMocks.createTeamCheckoutSession).toHaveBeenCalledWith(
        'team-free',
        'monthly'
      );
    });
    expect(window.location.assign).toHaveBeenCalledWith('https://checkout.stripe.com/test');
  });

  test('opens the billing portal for an active team', async () => {
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

  test('shows three plan columns', async () => {
    renderPricing();
    expect(await screen.findByText(/^Free$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Team$/i)).toBeInTheDocument();
    expect(screen.getByText(/^League$/i)).toBeInTheDocument();
  });

  test('interval toggle updates price display', async () => {
    renderPricing();
    await waitFor(() => expect(screen.getByText(/\$12\/mo/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Season/i }));

    expect(screen.getByText(/\$89\/season/i)).toBeInTheDocument();
    expect(screen.queryByText(/\$12\/mo/i)).not.toBeInTheDocument();
  });

  test('unauthenticated user sees register link for team column', async () => {
    authMocks.useAuth.mockReturnValue({ user: null });
    renderPricing();

    const registerLinks = await screen.findAllByRole('link', { name: /Start 14-day Trial/i });
    expect(registerLinks.length).toBeGreaterThan(0);
    expect(registerLinks[0]).toHaveAttribute('href', expect.stringContaining('/register'));
  });
});
