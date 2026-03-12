import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';

vi.mock('../../app/store/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: { name: 'Simon' } })),
}));

vi.mock('../teams/api/teamsApi', () => ({
  teamsApi: {
    list: vi.fn(),
  },
}));

vi.mock('../games/api/gamesApi', () => ({
  gamesApi: {
    list: vi.fn(),
  },
}));

import { teamsApi } from '../teams/api/teamsApi';
import { gamesApi } from '../games/api/gamesApi';

function renderDashboard() {
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  test('renders quick action buttons and does not render debug JSON', async () => {
    teamsApi.list.mockResolvedValue({ teams: [] });
    gamesApi.list.mockResolvedValue({ games: [] });

    renderDashboard();

    expect(screen.getByRole('link', { name: /New Game/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View Games/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Manage Team/i })).toBeInTheDocument();
    expect(screen.queryByText(/"name":/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/No games recorded yet/i)).toBeInTheDocument();
    });
  });

  test('renders empty team state with create team CTA', async () => {
    teamsApi.list.mockResolvedValue({ teams: [] });
    gamesApi.list.mockResolvedValue({ games: [] });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/No team yet/i)).toBeInTheDocument();
    });
    expect(screen.getAllByRole('link', { name: /Create Team/i }).length).toBeGreaterThan(0);
  });

  test('renders summary, team snapshot, and recent games when data exists', async () => {
    teamsApi.list.mockResolvedValue({
      teams: [
        { id: 't1', name: 'TSW A' },
        { id: 't2', name: 'TSW B' },
        { id: 't3', name: 'TSW C' },
        { id: 't4', name: 'TSW D' },
      ],
    });
    gamesApi.list.mockResolvedValue({
      games: [
        { id: 'g1', title: 'vs Eagles', gameDate: '2026-03-10T00:00:00.000Z', status: 'finished' },
        {
          id: 'g2',
          title: 'vs Hawks',
          gameDate: '2026-03-11T00:00:00.000Z',
          status: 'in_progress',
        },
      ],
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('TSW A')).toBeInTheDocument();
    });

    expect(screen.getByText('TSW B')).toBeInTheDocument();
    expect(screen.getByText('TSW C')).toBeInTheDocument();
    expect(screen.getByText('+1 more')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/vs Hawks/i)).toBeInTheDocument();
    expect(screen.getByText(/In Progress/i)).toBeInTheDocument();
    expect(screen.getByText(/Finished/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open details for vs Hawks/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Track vs Hawks/i })).toBeInTheDocument();
  });

  test('renders error banner when API calls fail', async () => {
    teamsApi.list.mockRejectedValue(new Error('Failed to load dashboard'));
    gamesApi.list.mockRejectedValue(new Error('Failed to load dashboard'));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Failed to load dashboard/i)).toBeInTheDocument();
    });
  });
});
