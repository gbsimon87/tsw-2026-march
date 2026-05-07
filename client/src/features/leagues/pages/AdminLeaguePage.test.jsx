import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AdminLeaguePage } from './AdminLeaguePage';
import { leaguesApi } from '../api/leaguesApi';

const authMocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock('../../../app/store/AuthContext', () => ({
  useAuth: authMocks.useAuth,
}));

vi.mock('../api/leaguesApi', () => ({
  leaguesApi: {
    getById: vi.fn(),
    update: vi.fn(),
    listLeagueManagers: vi.fn(),
  },
}));

function buildLeague(overrides = {}) {
  return {
    id: 'league-1',
    name: 'City League',
    ownerUserId: 'owner-1',
    seasonLabel: 'Spring 2026',
    status: 'active',
    isPublic: false,
    games: [],
    standings: [],
    teams: [],
    viewerContext: { viewerRole: 'league_manager', managedTeamIds: [] },
    ...overrides,
  };
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/admin/leagues/league-1']}>
      <Routes>
        <Route path="/admin/leagues/:leagueId" element={<AdminLeaguePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminLeaguePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.useAuth.mockReturnValue({ user: { id: 'user-1' } });
    leaguesApi.getById.mockResolvedValue({ league: buildLeague() });
    leaguesApi.listLeagueManagers.mockResolvedValue({ managers: [] });
  });

  afterEach(() => {
    cleanup();
  });

  test('allows a league manager to update the league name inline from the header', async () => {
    leaguesApi.update.mockResolvedValue({
      league: buildLeague({ name: 'Metro League' }),
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit league name' }));

    const nameInput = screen.getByRole('textbox', { name: 'League Name' });
    fireEvent.change(nameInput, { target: { value: 'Metro League' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save league name' }));

    await waitFor(() => {
      expect(leaguesApi.update).toHaveBeenCalledWith('league-1', { name: 'Metro League' });
    });
    expect(await screen.findAllByText('Metro League')).not.toHaveLength(0);
    expect(screen.queryByRole('textbox', { name: 'League Name' })).not.toBeInTheDocument();
  });

  test('shows team managers grouped by team for league owners', async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 'owner-1' } });
    leaguesApi.listLeagueManagers.mockResolvedValue({
      managers: [
        {
          id: 'league-manager-1',
          userName: 'Jordan Admin',
          userEmail: 'jordan@example.com',
        },
      ],
    });
    leaguesApi.getById.mockResolvedValue({
      league: buildLeague({
        viewerContext: { viewerRole: 'owner', managedTeamIds: [] },
        teams: [
          {
            id: 'team-1',
            name: 'North Hoops',
            members: [
              {
                id: 'member-1',
                role: 'manager',
                userName: 'Avery Stone',
                userEmail: 'avery@example.com',
              },
            ],
          },
          { id: 'team-2', name: 'South Hoops', members: [] },
        ],
      }),
    });

    renderPage();

    expect(await screen.findByText('League Managers')).toBeInTheDocument();
    expect(screen.getByText('Jordan Admin')).toBeInTheDocument();
    expect(screen.getByText('jordan@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(await screen.findByText('Team Managers')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'North Hoops' })).toHaveAttribute(
      'href',
      '/admin/leagues/league-1/teams/team-1'
    );
    expect(screen.getByText('Avery Stone')).toBeInTheDocument();
    expect(screen.getByText(/avery@example\.com/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'South Hoops' })).toBeInTheDocument();
    expect(screen.getByText('No team managers')).toBeInTheDocument();
  });
});
