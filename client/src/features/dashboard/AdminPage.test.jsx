import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AdminPage } from './AdminPage';

const apiMocks = vi.hoisted(() => ({
  listTeams: vi.fn(),
  listLeagues: vi.fn(),
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

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.useAuth.mockReturnValue({ user: { id: 'user-1', roles: ['user'] } });
    apiMocks.listTeams.mockResolvedValue({ teams: [] });
    apiMocks.listLeagues.mockResolvedValue({ leagues: [] });
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
});
