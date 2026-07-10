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
    listSeasons: vi.fn(),
    createSeason: vi.fn(),
    completeSeason: vi.fn(),
  },
}));

function buildLeague(overrides = {}) {
  return {
    id: 'league-1',
    name: 'City League',
    ownerUserId: 'owner-1',
    seasonLabel: 'Spring 2026',
    currentSeason: { id: 'season-1', label: 'Spring 2026', status: 'active' },
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
    leaguesApi.listSeasons.mockResolvedValue({ seasons: [] });
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

    // Managers live under the Managers tab (default tab is Games).
    fireEvent.click(await screen.findByRole('button', { name: 'Managers' }));

    expect(await screen.findByText('League Managers')).toBeInTheDocument();
    expect(screen.getByText('Jordan Admin')).toBeInTheDocument();
    expect(screen.getByText(/jordan@example\.com/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remove' }).length).toBeGreaterThan(0);
    expect(await screen.findByText('Team Managers')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'North Hoops' })).toHaveAttribute(
      'href',
      '/admin/leagues/league-1/teams/team-1'
    );
    expect(screen.getByText('Avery Stone')).toBeInTheDocument();
    expect(screen.getByText(/avery@example\.com/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'South Hoops' })).toBeInTheDocument();
    expect(screen.getByText('No managers assigned')).toBeInTheDocument();
  });

  test('shows the Complete Season control to a league owner with an active season', async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 'owner-1' } });
    leaguesApi.getById.mockResolvedValue({
      league: buildLeague({ viewerContext: { viewerRole: 'owner', managedTeamIds: [] } }),
    });
    leaguesApi.listSeasons.mockResolvedValue({
      seasons: [{ id: 'season-1', label: 'Spring 2026', status: 'active' }],
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));

    expect(await screen.findByRole('button', { name: 'Complete Season' })).toBeInTheDocument();
  });

  test('hides the Complete Season control from a non-owner league manager', async () => {
    // Default league in beforeEach has viewerRole 'league_manager' and user-1.
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));

    // The Season section renders, but no owner-only Complete Season button.
    expect(await screen.findByText('Season')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Complete Season' })).not.toBeInTheDocument();
  });

  test('confirming Complete Season calls the API and refreshes the league', async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 'owner-1' } });
    leaguesApi.getById.mockResolvedValue({
      league: buildLeague({ viewerContext: { viewerRole: 'owner', managedTeamIds: [] } }),
    });
    leaguesApi.listSeasons.mockResolvedValue({
      seasons: [{ id: 'season-1', label: 'Spring 2026', status: 'active' }],
    });
    leaguesApi.completeSeason.mockResolvedValue({
      season: { id: 'season-1', label: 'Spring 2026', status: 'completed' },
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Complete Season' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yes, complete season' }));

    await waitFor(() => {
      expect(leaguesApi.completeSeason).toHaveBeenCalledWith('league-1', 'season-1');
    });
  });

  test('shows the Start New Season form once the current season is completed', async () => {
    authMocks.useAuth.mockReturnValue({ user: { id: 'owner-1' } });
    leaguesApi.getById.mockResolvedValue({
      league: buildLeague({
        viewerContext: { viewerRole: 'owner', managedTeamIds: [] },
        currentSeason: { id: 'season-1', label: 'Spring 2026', status: 'completed' },
      }),
    });
    leaguesApi.listSeasons.mockResolvedValue({
      seasons: [{ id: 'season-1', label: 'Spring 2026', status: 'completed' }],
    });
    leaguesApi.createSeason.mockResolvedValue({
      season: { id: 'season-2', label: 'Fall 2026', status: 'active' },
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));

    const labelInput = await screen.findByPlaceholderText(/New season label/i);
    fireEvent.change(labelInput, { target: { value: 'Fall 2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start New Season' }));

    await waitFor(() => {
      expect(leaguesApi.createSeason).toHaveBeenCalledWith('league-1', { label: 'Fall 2026' });
    });
  });
});
