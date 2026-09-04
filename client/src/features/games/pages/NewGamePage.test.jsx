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

    fireEvent.change(screen.getByPlaceholderText(/vs Wildcats — March 12/i), {
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

    fireEvent.change(screen.getByPlaceholderText(/vs Wildcats — March 12/i), {
      target: { value: 'Saturday Game' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create and Start Tracking/i }));

    await waitFor(() => {
      expect(gamesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 't1',
          title: 'Saturday Game',
          gameContext: 'standalone',
          trackingMode: 'one_sided',
        })
      );
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

    fireEvent.change(screen.getByPlaceholderText(/vs Wildcats — March 12/i), {
      target: { value: 'Film Session' },
    });
    // Schedule, format and video moved behind a disclosure — all optional, and
    // they used to sit between the required title and the submit button.
    fireEvent.click(screen.getByRole('button', { name: /Schedule, format and video/i }));
    fireEvent.change(screen.getByPlaceholderText(/https:\/\/www\.youtube\.com\/watch\?v=/i), {
      target: { value: 'https://youtu.be/dQw4w9WgXcQ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create and Start Tracking/i }));

    await waitFor(() => {
      expect(gamesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 't1',
          title: 'Film Session',
          videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
          gameContext: 'standalone',
          trackingMode: 'one_sided',
        })
      );
    });
  });

  // The Scheduled At field now sits inside the collapsed "Schedule, format and
  // video" section, so the overflow guard has to be asserted after expanding.
  test('keeps the scheduled-at field inside its column and offers venue reuse', async () => {
    teamsApi.list.mockResolvedValue({
      teams: [
        {
          id: 't1',
          name: 'Team One',
          homeVenue: { arenaName: 'Central Court', city: 'London' },
        },
      ],
    });
    gamesApi.list.mockResolvedValue({
      games: [
        {
          id: 'g1',
          title: 'Old',
          opponent: 'Wildcats',
          teamId: 't1',
          venue: 'Riverside Gym',
          venueAddress: { city: 'Bristol' },
        },
      ],
    });

    render(
      <MemoryRouter>
        <NewGamePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Create Game/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Schedule, format and video/i }));

    const scheduledAt = await screen.findByLabelText(/Scheduled at/i);
    expect(scheduledAt).toHaveClass('min-w-0', 'max-w-full');

    // Both the team's home venue and a venue used by a past game are reusable.
    const venuePicker = screen.getByLabelText('Use a previous venue');
    const optionLabels = Array.from(venuePicker.options).map((option) => option.textContent);
    expect(optionLabels).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Central Court'),
        expect.stringContaining('Riverside Gym'),
      ])
    );
  });

  test('links an unsubscribed team to pricing instead of letting the create fail', async () => {
    teamsApi.list.mockResolvedValue({
      teams: [{ id: 't1', name: 'Team One', billing: { canManage: false } }],
    });
    gamesApi.list.mockResolvedValue({ games: [] });

    render(
      <MemoryRouter>
        <NewGamePage />
      </MemoryRouter>
    );

    const link = await screen.findByRole('link', { name: /View pricing/i });
    expect(link).toHaveAttribute('href', '/pricing?teamId=t1#additional-team');
    expect(screen.getByRole('button', { name: /Create and Start Tracking/i })).toBeDisabled();
  });

  test('offers a pricing link when the server rejects the create with 402', async () => {
    teamsApi.list.mockResolvedValue({ teams: [{ id: 't1', name: 'Team One' }] });
    gamesApi.list.mockResolvedValue({ games: [] });
    const paymentRequired = new Error(
      'This additional team needs an active £5/month subscription before it can be changed.'
    );
    paymentRequired.status = 402;
    gamesApi.create.mockRejectedValue(paymentRequired);

    render(
      <MemoryRouter>
        <NewGamePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Create Game/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/vs Wildcats — March 12/i), {
      target: { value: 'Friday Night' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create and Start Tracking/i }));

    const link = await screen.findByRole('link', { name: /Go to pricing to subscribe this team/i });
    expect(link).toHaveAttribute('href', '/pricing?teamId=t1#additional-team');
    expect(screen.getByText(/needs an active £5\/month subscription/i)).toBeInTheDocument();
  });
});
