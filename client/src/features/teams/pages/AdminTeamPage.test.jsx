import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AdminTeamPage } from './AdminTeamPage';
import { teamsApi } from '../api/teamsApi';
import { gamesApi } from '../../games/api/gamesApi';

vi.mock('../api/teamsApi', () => ({
  teamsApi: {
    getById: vi.fn(),
  },
}));

vi.mock('../../games/api/gamesApi', () => ({
  gamesApi: {
    list: vi.fn(),
  },
}));

vi.mock('../../billing/components/BillingStatusPill', () => ({
  BillingStatusPill: () => null,
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/admin/teams/t1']}>
      <Routes>
        <Route path="/admin/teams/:teamId" element={<AdminTeamPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminTeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gamesApi.list.mockResolvedValue({ games: [] });
  });

  afterEach(() => {
    cleanup();
  });

  test('sends an unsubscribed additional team to pricing instead of the game form', async () => {
    teamsApi.getById.mockResolvedValue({
      team: {
        id: 't1',
        name: 'Team One',
        players: [],
        billing: { canManage: false, capacityType: 'paid' },
      },
    });

    renderPage();

    const cta = await screen.findByRole('link', { name: /Subscribe to Track/i });
    expect(cta).toHaveAttribute('href', '/pricing?teamId=t1#additional-team');
    expect(screen.getByRole('link', { name: /See pricing/i })).toHaveAttribute(
      'href',
      '/pricing?teamId=t1#additional-team'
    );
    expect(screen.queryByRole('link', { name: /^New Game$/i })).not.toBeInTheDocument();
  });

  test('keeps the normal game flow for a team that can be managed', async () => {
    teamsApi.getById.mockResolvedValue({
      team: {
        id: 't1',
        name: 'Team One',
        players: [],
        billing: { canManage: true, capacityType: 'free' },
      },
    });

    renderPage();

    const cta = await screen.findByRole('link', { name: /New Game/i });
    expect(cta).toHaveAttribute('href', '/games/new?teamId=t1');
    expect(screen.getByRole('link', { name: /Track your first game/i })).toHaveAttribute(
      'href',
      '/games/new?teamId=t1'
    );
  });
});
