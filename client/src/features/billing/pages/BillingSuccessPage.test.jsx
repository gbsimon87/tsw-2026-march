import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BillingSuccessPage } from './BillingSuccessPage';

const teamsApiMocks = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock('../../teams/api/teamsApi', () => ({
  teamsApi: teamsApiMocks,
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
  });

  afterEach(() => {
    cleanup();
  });

  test('shows active state once the upgraded team becomes pro', async () => {
    teamsApiMocks.list.mockResolvedValue({
      teams: [
        {
          id: 'team-1',
          name: 'TSW A',
          billing: { plan: 'pro', subscriptionStatus: 'active' },
        },
      ],
    });

    renderSuccessPage();

    expect(await screen.findByText(/TSW A is now on Team Pro/i)).toBeInTheDocument();
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
            billing: { plan: 'pro', subscriptionStatus: 'active' },
          },
        ],
      });

    renderSuccessPage();

    expect(await screen.findByText(/Team Pro is still being finalized/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/TSW A is now on Team Pro/i, {}, { timeout: 4000 })
    ).toBeInTheDocument();
  }, 7000);

  test('shows attention state for non-active terminal billing status', async () => {
    teamsApiMocks.list.mockResolvedValue({
      teams: [
        {
          id: 'team-1',
          name: 'TSW A',
          billing: { plan: 'pro', subscriptionStatus: 'past_due' },
        },
      ],
    });

    renderSuccessPage();

    expect(await screen.findByText(/Billing Needs Attention/i)).toBeInTheDocument();
    expect(await screen.findByText(/still needs a billing review/i)).toBeInTheDocument();
  });
});
