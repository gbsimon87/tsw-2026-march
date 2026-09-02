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
  changeLeaguePlan: vi.fn(),
  chooseFreeTeam: vi.fn(),
}));
const teamsApiMocks = vi.hoisted(() => ({ list: vi.fn() }));
const leaguesApiMocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('../../../app/store/AuthContext', () => ({ useAuth: authMocks.useAuth }));
vi.mock('../api/billingApi', () => ({ billingApi: billingApiMocks }));
vi.mock('../../teams/api/teamsApi', () => ({ teamsApi: teamsApiMocks }));
vi.mock('../../leagues/api/leaguesApi', () => ({ leaguesApi: leaguesApiMocks }));

const CATALOG = {
  plans: [
    {
      id: 'starter',
      name: 'Your First Team',
      tagline: 'Track one team, free forever.',
      price: 'Free',
      features: ['Every available team feature'],
      intervals: {},
    },
    {
      id: 'team_extra',
      name: 'Additional Team',
      tagline: 'For every standalone team after your first.',
      features: ['All team features included'],
      intervals: { monthly: { display: '£5/mo per additional team', trialDays: 0 } },
    },
    {
      id: 'league',
      name: 'League',
      tagline: 'For up to 10 teams.',
      features: ['All team features included'],
      intervals: { monthly: { display: '£29/mo', trialDays: 14 } },
    },
    {
      id: 'league_plus',
      name: 'League Plus',
      tagline: 'For 11–24 teams.',
      features: ['Everything in League'],
      intervals: { monthly: { display: '£49/mo', trialDays: 14 } },
    },
  ],
};

function renderPricing(entry = '/pricing') {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/register" element={<div>Signup</div>} />
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
          billing: { capacityType: 'free', plan: 'starter', subscriptionStatus: 'inactive' },
        },
        {
          id: 'team-paid',
          name: 'Second Team',
          billing: { capacityType: 'paid', plan: 'starter', subscriptionStatus: 'inactive' },
        },
      ],
    });
    leaguesApiMocks.list.mockResolvedValue({ leagues: [] });
    billingApiMocks.createTeamCheckoutSession.mockResolvedValue({
      url: 'https://checkout.stripe.com/team',
    });
    billingApiMocks.createLeagueCheckoutSession.mockResolvedValue({
      url: 'https://checkout.stripe.com/league',
    });
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

  test('renders all four plans and the agreed monthly prices', async () => {
    renderPricing();
    expect(await screen.findByText(/^Your First Team$/)).toBeInTheDocument();
    expect(screen.getByText(/^Additional Team$/)).toBeInTheDocument();
    expect(screen.getByText(/^League$/)).toBeInTheDocument();
    expect(screen.getByText(/^League Plus$/)).toBeInTheDocument();
    expect(screen.getByText('£5/mo per additional team')).toBeInTheDocument();
    expect(screen.getByText('£29/mo')).toBeInTheDocument();
    expect(screen.getByText('£49/mo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /season/i })).not.toBeInTheDocument();
  });

  test('starts monthly checkout for the selected additional team', async () => {
    renderPricing();
    const button = await screen.findByRole('button', { name: /subscribe for this team/i });
    fireEvent.click(button);

    await waitFor(() =>
      expect(billingApiMocks.createTeamCheckoutSession).toHaveBeenCalledWith('team-paid')
    );
    expect(window.location.assign).toHaveBeenCalledWith('https://checkout.stripe.com/team');
  });

  test('does not offer a paid checkout for the already-free team', async () => {
    teamsApiMocks.list.mockResolvedValue({
      teams: [
        {
          id: 'team-free',
          name: 'Free Team',
          billing: { capacityType: 'free', plan: 'starter', subscriptionStatus: 'inactive' },
        },
      ],
    });
    renderPricing();

    const button = await screen.findByRole('button', { name: /already included/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(billingApiMocks.createTeamCheckoutSession).not.toHaveBeenCalled();
  });

  test('links an existing free team to management instead of offering a first team', async () => {
    renderPricing();

    const link = await screen.findByRole('link', { name: 'Manage your free team' });
    expect(link).toHaveAttribute('href', '/admin/teams/team-free');
    expect(screen.queryByRole('link', { name: /create your free team/i })).not.toBeInTheDocument();
  });

  test('can make an inactive paid team the free team', async () => {
    billingApiMocks.chooseFreeTeam.mockResolvedValue({ team: { capacityType: 'free' } });
    renderPricing();
    fireEvent.click(await screen.findByRole('button', { name: /make this my free team/i }));

    await waitFor(() => expect(billingApiMocks.chooseFreeTeam).toHaveBeenCalledWith('team-paid'));
    expect(screen.getByText(/previous free team is read-only/i)).toBeInTheDocument();
  });

  test('opens the portal for an active additional-team subscription', async () => {
    teamsApiMocks.list.mockResolvedValue({
      teams: [
        {
          id: 'team-paid',
          name: 'Second Team',
          billing: { capacityType: 'paid', plan: 'team_extra', subscriptionStatus: 'active' },
        },
      ],
    });
    renderPricing();
    fireEvent.click(await screen.findByRole('button', { name: /manage team billing/i }));

    await waitFor(() =>
      expect(billingApiMocks.createCustomerPortalSession).toHaveBeenCalledWith({
        teamId: 'team-paid',
      })
    );
  });

  test('opens the portal so a past-due League can repair its payment method', async () => {
    leaguesApiMocks.list.mockResolvedValue({
      leagues: [
        {
          id: 'league-past-due',
          name: 'Needs Payment',
          billing: {
            plan: 'starter',
            subscriptionStatus: 'past_due',
            managedByStripe: true,
          },
        },
      ],
    });
    renderPricing();

    const manageButtons = await screen.findAllByRole('button', { name: 'Manage billing' });
    expect(manageButtons).toHaveLength(2);
    fireEvent.click(manageButtons[0]);

    await waitFor(() =>
      expect(billingApiMocks.createCustomerPortalSession).toHaveBeenCalledWith({
        leagueId: 'league-past-due',
      })
    );
    expect(billingApiMocks.changeLeaguePlan).not.toHaveBeenCalled();
  });

  test('starts League Plus checkout with the correct plan ID', async () => {
    renderPricing();
    const buttons = await screen.findAllByRole('button', { name: /start 14-day trial/i });
    fireEvent.click(buttons[1]);

    await waitFor(() =>
      expect(billingApiMocks.createLeagueCheckoutSession).toHaveBeenCalledWith(
        'league_plus',
        undefined
      )
    );
  });

  test('new-League intent starts a new checkout even when another League exists', async () => {
    leaguesApiMocks.list.mockResolvedValue({
      leagues: [
        {
          id: 'league-active',
          name: 'Existing League',
          billing: { plan: 'league', subscriptionStatus: 'active' },
        },
      ],
    });
    billingApiMocks.createLeagueCheckoutSession.mockResolvedValue({
      devRedirectPath: '/admin/leagues/new',
    });
    renderPricing('/pricing?resourceType=league&action=create');
    fireEvent.click((await screen.findAllByRole('button', { name: /start 14-day trial/i }))[0]);

    await waitFor(() =>
      expect(billingApiMocks.createLeagueCheckoutSession).toHaveBeenCalledWith('league', undefined)
    );
    expect(billingApiMocks.createCustomerPortalSession).not.toHaveBeenCalled();
    expect(window.location.assign).toHaveBeenCalledWith('/admin/leagues/new');
  });

  test('does not send a grandfathered complimentary League to Stripe', async () => {
    leaguesApiMocks.list.mockResolvedValue({
      leagues: [
        {
          id: 'league-grandfathered',
          name: 'Existing League',
          billing: {
            plan: 'league_plus',
            subscriptionStatus: 'active',
            managedByStripe: false,
          },
        },
      ],
    });
    renderPricing();

    const buttons = await screen.findAllByRole('button', { name: 'Complimentary League' });
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.disabled)).toBe(true);
    fireEvent.click(buttons[0]);
    expect(billingApiMocks.createCustomerPortalSession).not.toHaveBeenCalled();
    expect(billingApiMocks.changeLeaguePlan).not.toHaveBeenCalled();
  });

  test('lets a League Plus owner cancel a scheduled downgrade', async () => {
    leaguesApiMocks.list.mockResolvedValue({
      leagues: [
        {
          id: 'league-plus',
          name: 'Big League',
          billing: {
            plan: 'league_plus',
            subscriptionStatus: 'active',
            managedByStripe: true,
            scheduledPlan: 'league',
          },
        },
      ],
    });
    billingApiMocks.changeLeaguePlan.mockResolvedValue({
      change: 'downgrade_canceled',
      scheduled: false,
    });
    renderPricing();

    fireEvent.click(await screen.findByRole('button', { name: 'Keep League Plus' }));
    await waitFor(() =>
      expect(billingApiMocks.changeLeaguePlan).toHaveBeenCalledWith('league-plus', 'league_plus')
    );
    expect(screen.getByText(/scheduled downgrade was canceled/i)).toBeInTheDocument();
  });

  test('links a blocked League Plus downgrade to team archiving', async () => {
    leaguesApiMocks.list.mockResolvedValue({
      leagues: [
        {
          id: 'league-plus',
          name: 'Big League',
          billing: {
            plan: 'league_plus',
            subscriptionStatus: 'active',
            managedByStripe: true,
          },
        },
      ],
    });
    billingApiMocks.changeLeaguePlan.mockRejectedValue(
      new Error('Archive teams until this League has 10 or fewer before downgrading')
    );
    renderPricing();

    fireEvent.click(await screen.findByRole('button', { name: 'Change to League' }));

    expect(
      await screen.findByRole('link', { name: 'Manage and archive league teams' })
    ).toHaveAttribute('href', '/admin/leagues/league-plus?tab=teams');
  });

  test('refreshes league billing state when the page regains focus after Stripe', async () => {
    leaguesApiMocks.list
      .mockResolvedValueOnce({
        leagues: [
          {
            id: 'league-1',
            name: 'City League',
            billing: { plan: 'league', subscriptionStatus: 'inactive', managedByStripe: true },
          },
        ],
      })
      .mockResolvedValue({
        leagues: [
          {
            id: 'league-1',
            name: 'City League',
            billing: { plan: 'league_plus', subscriptionStatus: 'active', managedByStripe: true },
          },
        ],
      });
    renderPricing('/pricing?resourceType=league&leagueId=league-1');

    expect((await screen.findAllByRole('button', { name: /start 14-day trial/i })).length).toBe(2);
    fireEvent(window, new Event('focus'));

    expect(await screen.findByRole('button', { name: 'Manage billing' })).toBeInTheDocument();
  });

  test('signed-out visitors see signup links', async () => {
    authMocks.useAuth.mockReturnValue({ user: null });
    renderPricing();
    const links = await screen.findAllByRole('link', { name: /start 14-day trial/i });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/register');
  });
});
