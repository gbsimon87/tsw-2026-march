import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AdminPage } from './AdminPage';

const apiMocks = vi.hoisted(() => ({
  listTeams: vi.fn(),
  listLeagues: vi.fn(),
  managedScrimmages: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock('../../app/store/AuthContext', () => ({
  useAuth: authMocks.useAuth,
}));

vi.mock('../teams/api/teamsApi', () => ({
  teamsApi: { list: apiMocks.listTeams },
}));

vi.mock('../leagues/api/leaguesApi', () => ({
  leaguesApi: { list: apiMocks.listLeagues },
}));

vi.mock('../scrimmages/api/scrimmagesApi', () => ({
  scrimmagesApi: { managed: apiMocks.managedScrimmages },
}));

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.useAuth.mockReturnValue({ user: { id: 'user-1', roles: ['user'] } });
    apiMocks.listTeams.mockResolvedValue({ teams: [] });
    apiMocks.listLeagues.mockResolvedValue({ leagues: [] });
    apiMocks.managedScrimmages.mockResolvedValue({ scrimmages: [] });
  });

  test('starts with the admin controls instead of a large dashboard banner', async () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(apiMocks.listTeams).toHaveBeenCalledTimes(1);
      expect(apiMocks.listLeagues).toHaveBeenCalledTimes(1);
    });

    expect(
      screen.queryByText('Manage your leagues and non-league teams all in one place.')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Admin' })).toHaveClass('sr-only');
    expect(screen.getByRole('button', { name: 'Managed Leagues' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Managed Teams' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Instagram publishing/i })).not.toBeInTheDocument();
  });

  test('shows Instagram operations to platform operators', async () => {
    authMocks.useAuth.mockReturnValue({
      user: { id: 'operator-1', roles: ['platform_operator'] },
    });

    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('link', { name: /Instagram publishing/i })).toHaveAttribute(
      'href',
      '/admin/social/instagram'
    );
  });
  test('lists scrimmages in their own tab with admin links and an on-demand creation action', async () => {
    apiMocks.managedScrimmages.mockResolvedValue({
      scrimmages: [
        {
          id: 'series-1',
          name: 'We-ball Wednesdays',
          activeSeasonId: 'season-1',
          seasons: [{ id: 'season-1', label: 'Season 1' }],
          isOwner: true,
        },
      ],
    });
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminPage />
      </MemoryRouter>
    );
    await screen.findByRole('button', { name: 'Managed Scrimmages' });
    expect(screen.queryByRole('link', { name: /We-ball Wednesdays/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Manage scrimmages/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Managed Scrimmages' }));
    expect(await screen.findByRole('link', { name: /We-ball Wednesdays/ })).toHaveAttribute(
      'href',
      '/admin/scrimmage/series-1'
    );
    expect(screen.getByRole('link', { name: 'New Scrimmage' })).toHaveAttribute(
      'href',
      '/admin/scrimmages?create=1'
    );
    expect(screen.queryByRole('heading', { name: 'Managed Leagues' })).not.toBeInTheDocument();
  });

  test('opens the managed scrimmages tab from its navigation URL', async () => {
    render(
      <MemoryRouter initialEntries={['/admin?tab=scrimmages']}>
        <AdminPage />
      </MemoryRouter>
    );
    expect(await screen.findByRole('heading', { name: 'Managed Scrimmages' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Managed Scrimmages' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      await screen.findByRole('link', { name: /Create your first scrimmage/ })
    ).toBeInTheDocument();
  });
});
