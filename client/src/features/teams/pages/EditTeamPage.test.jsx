import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { EditTeamPage } from './EditTeamPage';
import { teamsApi } from '../api/teamsApi';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../api/teamsApi', () => ({
  teamsApi: {
    getById: vi.fn(),
    update: vi.fn(),
    uploadLogo: vi.fn(),
    removeLogo: vi.fn(),
    updatePlayer: vi.fn(),
    removePlayer: vi.fn(),
  },
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/teams/team-1/edit']}>
      <Routes>
        <Route path="/teams/:teamId/edit" element={<EditTeamPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EditTeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test('loads existing team data and submits updated metadata', async () => {
    teamsApi.getById.mockResolvedValue({
      team: {
        id: 'team-1',
        name: 'TSW A',
        logo: null,
        colors: ['#112233'],
        homeVenue: {
          arenaName: 'Main Gym',
          addressLine1: '123 Court St',
          addressLine2: null,
          city: 'Toronto',
          state: 'ON',
          postalCode: 'M5V 1A1',
          country: 'Canada',
        },
        updatedAt: '2026-03-11T00:00:00.000Z',
        players: [
          { id: 'p1', displayName: 'Jordan', jerseyNumber: 23, position: 'PG', isActive: true },
        ],
      },
    });
    teamsApi.update.mockResolvedValue({
      team: {
        id: 'team-1',
        name: 'TSW Blue',
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByDisplayValue('TSW A')).toBeInTheDocument();
    });

    expect(screen.getByText('TSW A')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Team Name/i), {
      target: { value: 'TSW Blue' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(teamsApi.update).toHaveBeenCalledWith('team-1', {
        name: 'TSW Blue',
        colors: ['#112233'],
        homeVenue: {
          arenaName: 'Main Gym',
          addressLine1: '123 Court St',
          addressLine2: '',
          city: 'Toronto',
          state: 'ON',
          postalCode: 'M5V 1A1',
          country: 'Canada',
        },
      });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/admin');
  });

  test('allows updating a player name and jersey number', async () => {
    teamsApi.getById.mockResolvedValue({
      team: {
        id: 'team-1',
        name: 'TSW A',
        logo: null,
        colors: [],
        homeVenue: null,
        updatedAt: '2026-03-11T00:00:00.000Z',
        players: [
          { id: 'p1', displayName: 'Jordan', jerseyNumber: 23, position: 'PG', isActive: true },
        ],
      },
    });
    teamsApi.updatePlayer.mockResolvedValue({
      team: {
        id: 'team-1',
        name: 'TSW A',
        updatedAt: '2026-03-11T00:00:00.000Z',
        players: [
          {
            id: 'p1',
            displayName: 'Jordan Bell',
            jerseyNumber: 45,
            position: 'SG',
            isActive: true,
          },
        ],
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Show/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Show/i }));
    fireEvent.change(screen.getByLabelText(/Player 1 Name/i), {
      target: { value: 'Jordan Bell' },
    });
    fireEvent.change(screen.getByLabelText(/Jersey Number/i), {
      target: { value: '45' },
    });
    fireEvent.change(screen.getByLabelText(/Position/i), {
      target: { value: 'SG' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save player Jordan Bell/i }));

    await waitFor(() => {
      expect(teamsApi.updatePlayer).toHaveBeenCalledWith('team-1', 'p1', {
        displayName: 'Jordan Bell',
        jerseyNumber: 45,
        position: 'SG',
      });
    });

    expect(screen.getByDisplayValue('Jordan Bell')).toBeInTheDocument();
    expect(screen.getByDisplayValue('45')).toBeInTheDocument();
    expect(screen.getByDisplayValue('SG')).toBeInTheDocument();
  });

  test('allows removing a player from the visible roster', async () => {
    teamsApi.getById.mockResolvedValue({
      team: {
        id: 'team-1',
        name: 'TSW A',
        logo: null,
        colors: [],
        homeVenue: null,
        updatedAt: '2026-03-11T00:00:00.000Z',
        players: [
          { id: 'p1', displayName: 'Jordan', jerseyNumber: 23, position: null, isActive: true },
          { id: 'p2', displayName: 'Casey', jerseyNumber: 4, position: null, isActive: true },
        ],
      },
    });
    teamsApi.removePlayer.mockResolvedValue({
      team: {
        id: 'team-1',
        name: 'TSW A',
        updatedAt: '2026-03-11T00:00:00.000Z',
        players: [
          { id: 'p1', displayName: 'Jordan', jerseyNumber: 23, position: null, isActive: false },
          { id: 'p2', displayName: 'Casey', jerseyNumber: 4, position: null, isActive: true },
        ],
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Show/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Show/i }));
    await waitFor(() => {
      expect(screen.getByDisplayValue('Jordan')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Casey')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Remove player Jordan/i }));

    await waitFor(() => {
      expect(teamsApi.removePlayer).toHaveBeenCalledWith('team-1', 'p1');
    });

    expect(screen.queryByDisplayValue('Jordan')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Casey')).toBeInTheDocument();
  });

  test('renders load errors', async () => {
    teamsApi.getById.mockRejectedValue(new Error('Failed to load team'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Failed to load team/i)).toBeInTheDocument();
    });
  });
});
