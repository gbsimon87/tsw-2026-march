import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { AdminPage } from './AdminPage';

const apiMocks = vi.hoisted(() => ({
  listTeams: vi.fn(),
  listLeagues: vi.fn(),
}));

vi.mock('../teams/api/teamsApi', () => ({
  teamsApi: { list: apiMocks.listTeams },
}));

vi.mock('../leagues/api/leaguesApi', () => ({
  leaguesApi: { list: apiMocks.listLeagues },
}));

describe('AdminPage', () => {
  test('starts with the admin controls instead of a large dashboard banner', async () => {
    apiMocks.listTeams.mockResolvedValue({ teams: [] });
    apiMocks.listLeagues.mockResolvedValue({ leagues: [] });

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
    expect(screen.getByRole('button', { name: 'My Leagues' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'One-off Teams' })).toBeInTheDocument();
  });
});
