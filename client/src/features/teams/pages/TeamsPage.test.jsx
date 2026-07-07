import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { TeamsPage } from './TeamsPage';
import { teamsApi } from '../api/teamsApi';

vi.mock('../api/teamsApi', () => ({
  teamsApi: {
    list: vi.fn(),
  },
}));

function renderPage() {
  // OPT-014b: TeamsPage now uses React Query, so it needs a provider. Fresh
  // client per render keeps the cache from leaking across tests.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TeamsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('TeamsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test('renders empty team state and new-team CTA', async () => {
    teamsApi.list.mockResolvedValue({ teams: [] });

    renderPage();

    expect(screen.getByRole('link', { name: /New Team/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/No team yet/i)).toBeInTheDocument();
    });

    expect(screen.getAllByRole('link', { name: /Create Team/i }).length).toBeGreaterThan(0);
  });

  test('renders team snapshot cards and edit links', async () => {
    teamsApi.list.mockResolvedValue({
      teams: [
        {
          id: 't1',
          name: 'TSW A',
          logo: { url: 'https://example.com/a.png' },
          colors: ['#112233'],
          players: [{ isActive: true }, { isActive: false }],
        },
        { id: 't2', name: 'TSW B', logo: null, colors: [], players: [{ isActive: true }] },
        { id: 't3', name: 'TSW C', logo: null, colors: [], players: [{ isActive: true }] },
        { id: 't4', name: 'TSW D', logo: null, colors: [], players: [{ isActive: true }] },
        { id: 't5', name: 'TSW E', logo: null, colors: [], players: [{ isActive: true }] },
        { id: 't6', name: 'TSW F', logo: null, colors: [], players: [{ isActive: true }] },
        { id: 't7', name: 'TSW G', logo: null, colors: [], players: [{ isActive: true }] },
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('TSW A')).toBeInTheDocument();
    });

    expect(screen.getByText('TSW F')).toBeInTheDocument();
    expect(screen.queryByText('TSW G')).not.toBeInTheDocument();
    expect(screen.getByAltText('TSW A logo')).toHaveAttribute('src', 'https://example.com/a.png');
    expect(screen.getByRole('link', { name: /Edit TSW A/i })).toHaveAttribute(
      'href',
      '/teams/t1/edit'
    );
    expect(screen.getByText('+1 more')).toBeInTheDocument();
    const summarySection = screen.getByRole('heading', { name: 'Summary' }).closest('section');
    expect(summarySection).not.toBeNull();
    const summary = within(summarySection);
    expect(summary.getByText('Teams')).toBeInTheDocument();
    expect(summary.getByText('Active Players')).toBeInTheDocument();
    expect(summary.getAllByText('7')).toHaveLength(2);
  });

  test('renders error banner when team loading fails', async () => {
    teamsApi.list.mockRejectedValue(new Error('Failed to load teams'));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Failed to load teams/i)).toBeInTheDocument();
    });
  });
});
