import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BillingSuccessPage } from './BillingSuccessPage';

const teamsApiMocks = vi.hoisted(() => ({
  list: vi.fn(),
}));

const leaguesApiMocks = vi.hoisted(() => ({
  list: vi.fn(),
}));

const billingApiMocks = vi.hoisted(() => ({
  getCheckoutStatus: vi.fn(),
}));

vi.mock('../../teams/api/teamsApi', () => ({
  teamsApi: teamsApiMocks,
}));

vi.mock('../../leagues/api/leaguesApi', () => ({
  leaguesApi: leaguesApiMocks,
}));

vi.mock('../api/billingApi', () => ({
  billingApi: billingApiMocks,
}));

function renderSuccessPage(initialEntry = '/billing/success?teamId=team-1') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/billing/success" element={<BillingSuccessPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('BillingSuccessPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaguesApiMocks.list.mockResolvedValue({ leagues: [] });
  });

  afterEach(() => {
    cleanup();
  });

  test('shows active state once the team plan becomes active', async () => {
    teamsApiMocks.list.mockResolvedValue({
      teams: [
        {
          id: 'team-1',
          name: 'TSW A',
          billing: { plan: 'team', subscriptionStatus: 'active' },
        },
      ],
    });

    renderSuccessPage();

    expect(
      await screen.findByText(/TSW A is now on the additional-team plan/i)
    ).toBeInTheDocument();
  });

  test('keeps polling while the team is still pending, then resolves active', async () => {
    teamsApiMocks.list
      .mockResolvedValueOnce({
        teams: [
          {
            id: 'team-1',
            name: 'TSW A',
            billing: { plan: 'free', subscriptionStatus: 'inactive' },
          },
        ],
      })
      .mockResolvedValueOnce({
        teams: [
          {
            id: 'team-1',
            name: 'TSW A',
            billing: { plan: 'team', subscriptionStatus: 'active' },
          },
        ],
      });

    renderSuccessPage();

    expect(
      await screen.findByText(/additional-team plan is still being finalized/i)
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/TSW A is now on the additional-team plan/i, {}, { timeout: 4000 })
    ).toBeInTheDocument();
  }, 7000);

  test('shows attention state for non-active terminal billing status', async () => {
    teamsApiMocks.list.mockResolvedValue({
      teams: [
        {
          id: 'team-1',
          name: 'TSW A',
          billing: { plan: 'team', subscriptionStatus: 'past_due' },
        },
      ],
    });

    renderSuccessPage();

    expect(await screen.findByText(/Billing Needs Attention/i)).toBeInTheDocument();
    expect(await screen.findByText(/still needs a billing review/i)).toBeInTheDocument();
  });

  test('shows active state for league resourceType', async () => {
    leaguesApiMocks.list.mockResolvedValue({
      leagues: [
        {
          id: 'league-1',
          name: 'TSW League',
          billing: { plan: 'league', subscriptionStatus: 'trialing', trialEnd: null },
        },
      ],
    });

    renderSuccessPage('/billing/success?resourceType=league');

    expect(await screen.findByText(/TSW League is now on the League plan/i)).toBeInTheDocument();
  });

  test('confirms the exact Checkout Session instead of another active league', async () => {
    billingApiMocks.getCheckoutStatus.mockResolvedValue({
      checkoutStatus: 'complete',
      paymentStatus: 'paid',
      resourceType: 'league',
      resource: {
        id: 'league-new',
        name: 'New League',
        billing: { plan: 'league', subscriptionStatus: 'active' },
      },
    });

    renderSuccessPage('/billing/success?resourceType=league&session_id=cs_test_exactcheckout123');

    expect(await screen.findByText(/New League is now on the League plan/i)).toBeInTheDocument();
    expect(billingApiMocks.getCheckoutStatus).toHaveBeenCalledWith('cs_test_exactcheckout123');
    expect(leaguesApiMocks.list).not.toHaveBeenCalled();
  });

  test('sends a newly provisioned placeholder League to setup', async () => {
    billingApiMocks.getCheckoutStatus.mockResolvedValue({
      checkoutStatus: 'complete',
      paymentStatus: 'no_payment_required',
      resourceType: 'league',
      resource: {
        id: 'league-new',
        name: 'My League',
        billing: { plan: 'league', subscriptionStatus: 'trialing' },
      },
    });

    renderSuccessPage('/billing/success?resourceType=league&session_id=cs_test_newleague123');

    expect(await screen.findByRole('link', { name: /set up your league/i })).toHaveAttribute(
      'href',
      '/admin/leagues/new'
    );
  });
});
