import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NewGamePage } from './NewGamePage';
import { teamsApi } from '../../teams/api/teamsApi';
import { gamesApi } from '../api/gamesApi';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../teams/api/teamsApi', () => ({
  teamsApi: {
    list: vi.fn(),
  },
}));

vi.mock('../api/gamesApi', () => ({
  gamesApi: {
    list: vi.fn(),
    create: vi.fn(),
  },
}));

describe('NewGamePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  test('allows selecting existing opponent and submits it', async () => {
    teamsApi.list.mockResolvedValue({ teams: [{ id: 't1', name: 'Team One' }] });
    gamesApi.list.mockResolvedValue({
      games: [
        { id: 'g1', title: 'Old', opponent: 'Wildcats' },
        { id: 'g2', title: 'Old 2', opponent: 'wildcats' },
      ],
    });
    gamesApi.create.mockResolvedValue({ game: { id: 'game-123' } });

    render(
      <MemoryRouter>
        <NewGamePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Create Game/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/vs Wildcats - March 12/i), {
      target: { value: 'Friday Night' },
    });
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'Wildcats' } });
    fireEvent.click(screen.getByRole('button', { name: /Create and Start Tracking/i }));

    await waitFor(() => {
      expect(gamesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 't1',
          title: 'Friday Night',
          opponent: 'Wildcats',
        })
      );
    });

    expect(mockNavigate).toHaveBeenCalledWith('/games/game-123/track');
  });

  test('falls back to new opponent input and omits opponent when blank', async () => {
    teamsApi.list.mockResolvedValue({ teams: [{ id: 't1', name: 'Team One' }] });
    gamesApi.list.mockRejectedValue(new Error('failed to load games'));
    gamesApi.create.mockResolvedValue({ game: { id: 'game-456' } });

    render(
      <MemoryRouter>
        <NewGamePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/No previous opponents yet/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/vs Wildcats - March 12/i), {
      target: { value: 'Saturday Game' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create and Start Tracking/i }));

    await waitFor(() => {
      expect(gamesApi.create).toHaveBeenCalledWith({
        teamId: 't1',
        title: 'Saturday Game',
      });
    });
  });

  test('submits an optional YouTube video URL', async () => {
    teamsApi.list.mockResolvedValue({ teams: [{ id: 't1', name: 'Team One' }] });
    gamesApi.list.mockResolvedValue({ games: [] });
    gamesApi.create.mockResolvedValue({ game: { id: 'game-789' } });

    render(
      <MemoryRouter>
        <NewGamePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Create Game/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/vs Wildcats - March 12/i), {
      target: { value: 'Film Session' },
    });
    fireEvent.change(screen.getByPlaceholderText(/https:\/\/www\.youtube\.com\/watch\?v=/i), {
      target: { value: 'https://youtu.be/dQw4w9WgXcQ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create and Start Tracking/i }));

    await waitFor(() => {
      expect(gamesApi.create).toHaveBeenCalledWith({
        teamId: 't1',
        title: 'Film Session',
        videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });
    });
  });
});
