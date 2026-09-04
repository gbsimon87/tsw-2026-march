import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BillingStatusPill } from './BillingStatusPill';

const billingApiMocks = vi.hoisted(() => ({
  createCustomerPortalSession: vi.fn(),
}));

vi.mock('../api/billingApi', () => ({
  billingApi: billingApiMocks,
}));

function renderPill(props) {
  render(
    <MemoryRouter>
      <BillingStatusPill {...props} />
    </MemoryRouter>
  );
}

describe('BillingStatusPill', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    billingApiMocks.createCustomerPortalSession.mockResolvedValue({
      url: 'https://billing.stripe.com/portal',
    });
    delete window.location;
    window.location = { ...originalLocation, assign: vi.fn() };
  });

  afterEach(() => {
    cleanup();
    window.location = originalLocation;
  });

  test('active additional team shows its plan and billing portal', async () => {
    renderPill({
      billing: { capacityType: 'paid', plan: 'team_extra', subscriptionStatus: 'active' },
      scope: 'team',
      resourceId: 'team-1',
    });
    expect(screen.getByText('Additional Team')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Manage billing/i }));
    await waitFor(() => {
      expect(billingApiMocks.createCustomerPortalSession).toHaveBeenCalledWith({
        teamId: 'team-1',
      });
    });
    expect(window.location.assign).toHaveBeenCalledWith('https://billing.stripe.com/portal');
  });

  test('the designated free team is shown as included', () => {
    renderPill({
      billing: { capacityType: 'free', plan: 'starter', subscriptionStatus: 'inactive' },
      scope: 'team',
      resourceId: 'team-1',
    });
    expect(screen.getByText('Free Team')).toBeInTheDocument();
    expect(screen.getByText('Included')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Upgrade/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Manage billing/i })).not.toBeInTheDocument();
  });

  test('a grandfathered League shows complimentary and no Stripe action', () => {
    renderPill({
      billing: {
        plan: 'league_plus',
        subscriptionStatus: 'active',
        managedByStripe: false,
      },
      scope: 'league',
      resourceId: 'league-1',
    });

    expect(screen.getByText('Complimentary')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Manage billing/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Upgrade/i })).not.toBeInTheDocument();
  });

  test('legacy pro value is described as an additional team', () => {
    renderPill({
      billing: { plan: 'pro', subscriptionStatus: 'active' },
      scope: 'team',
      resourceId: 'team-1',
    });
    expect(screen.getByText('Additional Team')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Manage billing/i })).toBeInTheDocument();
  });

  test('past_due team shows Manage billing (portal), not Upgrade (audit M8)', () => {
    renderPill({
      billing: { capacityType: 'paid', plan: 'team_extra', subscriptionStatus: 'past_due' },
      scope: 'team',
      resourceId: 'team-1',
    });
    expect(screen.getByRole('button', { name: /Manage billing/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Upgrade/i })).not.toBeInTheDocument();
  });

  test('surfaces an error and clears busy when the portal returns no URL (audit M8)', async () => {
    billingApiMocks.createCustomerPortalSession.mockResolvedValueOnce({ url: null });
    renderPill({
      billing: { capacityType: 'paid', plan: 'team_extra', subscriptionStatus: 'active' },
      scope: 'team',
      resourceId: 'team-1',
    });

    const btn = screen.getByRole('button', { name: /Manage billing/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/Could not open billing portal/i)).toBeInTheDocument();
    });
    // Button no longer stuck on "Opening…"
    expect(screen.getByRole('button', { name: /Manage billing/i })).not.toBeDisabled();
  });

  test('active league shows League + portal call with leagueId', async () => {
    renderPill({
      billing: { plan: 'league', subscriptionStatus: 'active' },
      scope: 'league',
      resourceId: 'league-1',
    });
    expect(screen.getByText('League')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Manage billing/i }));
    await waitFor(() => {
      expect(billingApiMocks.createCustomerPortalSession).toHaveBeenCalledWith({
        leagueId: 'league-1',
      });
    });
  });

  test('a canceled League upgrade link targets that same League', () => {
    renderPill({
      billing: { plan: 'starter', subscriptionStatus: 'canceled' },
      scope: 'league',
      resourceId: 'league-old',
    });
    expect(screen.getByRole('link', { name: /Upgrade/i })).toHaveAttribute(
      'href',
      '/pricing?leagueId=league-old'
    );
  });
});
