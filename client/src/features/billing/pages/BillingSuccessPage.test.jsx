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

vi.mock('../../teams/api/teamsApi', () => ({
  teamsApi: teamsApiMocks,
}));

vi.mock('../../leagues/api/leaguesApi', () => ({
  leaguesApi: leaguesApiMocks,
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

    expect(await screen.findByText(/TSW A is now on the Team Pro plan/i)).toBeInTheDocument();
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

    expect(await screen.findByText(/Team Pro plan is still being finalized/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/TSW A is now on the Team Pro plan/i, {}, { timeout: 4000 })
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
});
