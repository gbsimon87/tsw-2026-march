import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NewTeamPage } from './NewTeamPage';
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
    create: vi.fn(),
    uploadLogo: vi.fn(),
  },
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/teams/new']}>
      <Routes>
        <Route path="/teams/new" element={<NewTeamPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('NewTeamPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test('submits team metadata, venue, colors, and player positions', async () => {
    teamsApi.create.mockResolvedValue({ team: { id: 'team-1' } });

    renderPage();

    fireEvent.change(screen.getByLabelText(/Team Name/i), {
      target: { value: 'TSW Blue' },
    });
    fireEvent.change(screen.getByLabelText(/Arena Name/i), {
      target: { value: 'Main Gym' },
    });
    fireEvent.change(screen.getByLabelText(/Address Line 1/i), {
      target: { value: '123 Court St' },
    });
    fireEvent.change(screen.getByLabelText(/City/i), {
      target: { value: 'Toronto' },
    });
    fireEvent.change(screen.getByLabelText(/State \/ Province/i), {
      target: { value: 'ON' },
    });
    fireEvent.change(screen.getByLabelText(/Postal Code/i), {
      target: { value: 'M5V 1A1' },
    });
    fireEvent.change(screen.getByLabelText(/Country/i), {
      target: { value: 'Canada' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Player Name/i), {
      target: { value: 'Jordan' },
    });
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'PG' },
    });

    const colorInputs = screen.getAllByDisplayValue('#000000');
    fireEvent.change(colorInputs[0], {
      target: { value: '#112233' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Create Team/i }));

    await waitFor(() => {
      expect(teamsApi.create).toHaveBeenCalledWith({
        name: 'TSW Blue',
        players: [{ displayName: 'Jordan', jerseyNumber: undefined, position: 'PG' }],
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

    expect(mockNavigate).toHaveBeenCalledWith('/pricing?teamId=team-1');
  });

  test('shows friendly inline errors when venue details are incomplete', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/Team Name/i), {
      target: { value: 'TSW Blue' },
    });
    fireEvent.change(screen.getByLabelText(/Arena Name/i), {
      target: { value: 'Main Gym' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Create Team/i }));

    await waitFor(() => {
      expect(
        screen.getByText('There are a few details to fix before we can create this team.')
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Add the street address.')).toBeInTheDocument();
    expect(screen.getByText('Add the city.')).toBeInTheDocument();
    expect(screen.getByText('Add the state or province.')).toBeInTheDocument();
    expect(screen.getByText('Add the postal code.')).toBeInTheDocument();
    expect(screen.getByText('Add the country.')).toBeInTheDocument();
    expect(teamsApi.create).not.toHaveBeenCalled();
  });
});
