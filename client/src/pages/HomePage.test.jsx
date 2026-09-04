import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HomePage } from './HomePage';
import { teamsApi } from '../features/teams/api/teamsApi';
import { leaguesApi } from '../features/leagues/api/leaguesApi';

vi.mock('../app/store/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));

vi.mock('../features/teams/api/teamsApi', () => ({
  teamsApi: {
    listPublic: vi.fn(),
  },
}));

vi.mock('../features/leagues/api/leaguesApi', () => ({
  leaguesApi: {
    listPublic: vi.fn(),
  },
}));

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test('renders active leagues and featured public teams', async () => {
    teamsApi.listPublic.mockResolvedValue({
      teams: [{ id: 'team-1', name: 'TSW Blue', logo: null }],
    });
    leaguesApi.listPublic.mockResolvedValue({
      leagues: [
        {
          id: 'league-1',
          name: 'Spring League',
          slug: 'spring-league',
          seasonLabel: 'Spring 2026',
          isPublic: true,
          status: 'active',
        },
      ],
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(
      screen.queryByText('Live leagues. Real stats. Every possession.')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Discover' })).toHaveClass('sr-only');
    expect(screen.getByRole('tablist', { name: 'Discover categories' })).toHaveClass('sticky');
    expect(screen.getByTestId('discover-search-bar')).toHaveClass('sticky', 'top-14', 'sm:top-12');

    await screen.findByPlaceholderText('Search leagues');

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/league/spring-league'
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Teams' }));

    await screen.findByPlaceholderText('Search teams');
    expect(screen.getByTestId('discover-search-bar')).toHaveClass('sticky', 'top-14', 'sm:top-12');
    expect(screen.getByRole('link', { name: /TSW Blue/ })).toHaveAttribute('href', '/teams/team-1');
  });

  test('renders empty states when no public leagues or teams are available', async () => {
    teamsApi.listPublic.mockResolvedValue({ teams: [] });
    leaguesApi.listPublic.mockResolvedValue({ leagues: [] });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/No public leagues yet/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Teams' }));

    await waitFor(() => {
      expect(screen.getByText(/No public teams yet/i)).toBeInTheDocument();
    });
  });

  test('opens the Discover tab requested in the URL', async () => {
    teamsApi.listPublic.mockResolvedValue({
      teams: [{ id: 'team-1', name: 'TSW Blue', logo: null }],
    });
    leaguesApi.listPublic.mockResolvedValue({ leagues: [] });

    render(
      <MemoryRouter initialEntries={['/home?tab=teams']}>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByRole('tab', { name: 'Teams' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByPlaceholderText('Search teams')).toBeInTheDocument();
  });

  test('filters leagues and teams by search input', async () => {
    teamsApi.listPublic.mockResolvedValue({
      teams: [{ id: 'team-1', name: 'TSW Blue', logo: null }],
    });
    leaguesApi.listPublic.mockResolvedValue({
      leagues: [
        {
          id: 'league-1',
          name: 'Spring League',
          slug: 'spring-league',
          seasonLabel: 'Spring 2026',
          isPublic: true,
          status: 'active',
        },
        {
          id: 'league-2',
          name: 'Winter Classic',
          slug: 'winter-classic',
          seasonLabel: 'Winter 2026',
          isPublic: true,
          status: 'active',
        },
      ],
    });

    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    await screen.findByPlaceholderText('Search leagues');

    fireEvent.change(screen.getByPlaceholderText('Search leagues'), {
      target: { value: 'winter' },
    });

    expect(screen.getByRole('heading', { name: 'Winter Classic' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Spring League' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Teams' }));

    await screen.findByPlaceholderText('Search teams');

    fireEvent.change(screen.getByPlaceholderText('Search teams'), {
      target: { value: 'nonexistent' },
    });

    expect(screen.getByText(/No teams match your search/i)).toBeInTheDocument();
  });
});
