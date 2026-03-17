import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PricingPage } from './PricingPage';

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn(() => ({ user: { id: 'user-1' } })),
}));

const billingApiMocks = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  createCustomerPortalSession: vi.fn(),
}));

const teamsApiMocks = vi.hoisted(() => ({
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

function renderPricing(initialEntry = '/pricing') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/teams/new" element={<div>Create team page</div>} />
        <Route path="/dashboard" element={<div>Dashboard page</div>} />
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/register" element={<div>Register page</div>} />
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
          id: 'team-pro',
          name: 'Pro Team',
          billing: { plan: 'pro', subscriptionStatus: 'active' },
        },
      ],
    });
    billingApiMocks.createCheckoutSession.mockResolvedValue({ url: 'https://checkout.test' });
    billingApiMocks.createCustomerPortalSession.mockResolvedValue({
      url: 'https://portal.test',
    });
    delete window.location;
    window.location = { ...originalLocation, assign: vi.fn() };
  });

  afterEach(() => {
    cleanup();
    window.location = originalLocation;
  });

  test('starts checkout for a free team', async () => {
    renderPricing();

    await waitFor(() => {
      expect(screen.getByText(/Current plan: free/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Choose Team Pro/i }));

    await waitFor(() => {
      expect(billingApiMocks.createCheckoutSession).toHaveBeenCalledWith('team-free');
    });
    expect(window.location.assign).toHaveBeenCalledWith('https://checkout.test');
  });

  test('opens the billing portal only for an active pro team', async () => {
    renderPricing('/pricing?teamId=team-pro');

    await waitFor(() => {
      expect(screen.getByText(/Current plan: pro • active/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Manage Team Pro Billing/i }));

    await waitFor(() => {
      expect(billingApiMocks.createCustomerPortalSession).toHaveBeenCalledWith('team-pro');
    });
    expect(window.location.assign).toHaveBeenCalledWith('https://portal.test');
    expect(billingApiMocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  test('uses checkout instead of portal for a non-active pro team', async () => {
    teamsApiMocks.list.mockResolvedValue({
      teams: [
        {
          id: 'team-past-due',
          name: 'Past Due Team',
          billing: { plan: 'pro', subscriptionStatus: 'past_due' },
        },
      ],
    });

    renderPricing();

    await waitFor(() => {
      expect(screen.getByText(/Current plan: pro • past_due/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Choose Team Pro/i }));

    await waitFor(() => {
      expect(billingApiMocks.createCheckoutSession).toHaveBeenCalledWith('team-past-due');
    });
    expect(billingApiMocks.createCustomerPortalSession).not.toHaveBeenCalled();
  });
});
