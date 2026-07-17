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

  test('active canonical team_pro shows Team Pro + Manage billing', async () => {
    renderPill({
      billing: { plan: 'team_pro', subscriptionStatus: 'active' },
      scope: 'team',
      resourceId: 'team-1',
    });
    expect(screen.getByText('Team Pro')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Manage billing/i }));
    await waitFor(() => {
      expect(billingApiMocks.createCustomerPortalSession).toHaveBeenCalledWith({
        teamId: 'team-1',
      });
    });
    expect(window.location.assign).toHaveBeenCalledWith('https://billing.stripe.com/portal');
  });

  test('starter/free team shows Starter + Upgrade link (no portal call)', () => {
    renderPill({
      billing: { plan: 'starter', subscriptionStatus: 'inactive' },
      scope: 'team',
      resourceId: 'team-1',
    });
    expect(screen.getByText('Starter')).toBeInTheDocument();
    const upgrade = screen.getByRole('link', { name: /Upgrade/i });
    expect(upgrade).toHaveAttribute('href', '/pricing');
    expect(screen.queryByRole('button', { name: /Manage billing/i })).not.toBeInTheDocument();
  });

  test('legacy pro value still reads as active Team Pro', () => {
    renderPill({
      billing: { plan: 'pro', subscriptionStatus: 'active' },
      scope: 'team',
      resourceId: 'team-1',
    });
    expect(screen.getByText('Team Pro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Manage billing/i })).toBeInTheDocument();
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
});
