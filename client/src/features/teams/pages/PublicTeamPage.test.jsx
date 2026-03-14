import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PublicTeamPage } from './PublicTeamPage';
import { teamsApi } from '../api/teamsApi';

vi.mock('../api/teamsApi', () => ({
  teamsApi: {
    getPublicById: vi.fn(),
  },
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/teams/team-1']}>
      <Routes>
        <Route path="/teams/:teamId" element={<PublicTeamPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PublicTeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test('renders team name, active roster, and split games lists', async () => {
    teamsApi.getPublicById.mockResolvedValue({
      team: {
        id: 'team-1',
        name: 'TSW Varsity',
        players: [
          { id: 'p1', displayName: 'Alex Carter', jerseyNumber: 12 },
          { id: 'p2', displayName: 'Jordan Lee', jerseyNumber: null },
        ],
      },
      games: [
        {
          id: 'g1',
          title: 'vs Falcons',
          opponent: 'Falcons',
          status: 'completed',
          scheduledAt: '2026-03-10T00:00:00.000Z',
          completedAt: '2026-03-10T02:00:00.000Z',
          teamPoints: 72,
          isPubliclyViewable: true,
          createdAt: '2026-03-10T00:00:00.000Z',
        },
        {
          id: 'g2',
          title: 'vs Hawks',
          opponent: 'Hawks',
          status: 'in_progress',
          scheduledAt: '2026-03-11T00:00:00.000Z',
          completedAt: null,
          teamPoints: null,
          isPubliclyViewable: true,
          createdAt: '2026-03-11T00:00:00.000Z',
        },
        {
          id: 'g3',
          title: 'vs Lions',
          opponent: 'Lions',
          status: 'in_progress',
          scheduledAt: '2099-03-10T00:00:00.000Z',
          completedAt: null,
          teamPoints: null,
          isPubliclyViewable: false,
          createdAt: '2026-03-11T00:00:00.000Z',
        },
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('TSW Varsity')).toBeInTheDocument();
    });

    expect(screen.getByText('#12 Alex Carter')).toBeInTheDocument();
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.getByText(/72 pts/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open details for Falcons/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open details for Hawks/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open details for Lions/i })).not.toBeInTheDocument();
  });

  test('renders empty states', async () => {
    teamsApi.getPublicById.mockResolvedValue({
      team: {
        id: 'team-1',
        name: 'TSW Varsity',
        players: [],
      },
      games: [],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/No active players listed yet/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/No upcoming games scheduled/i)).toBeInTheDocument();
    expect(screen.getByText(/No recent games yet/i)).toBeInTheDocument();
  });

  test('renders error state', async () => {
    teamsApi.getPublicById.mockRejectedValue(new Error('Team not found'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Team not found/i)).toBeInTheDocument();
    });
  });
});
