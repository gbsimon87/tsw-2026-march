import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useAuth } from '../../../app/store/AuthContext';
import { getOnboardingHandoff, OnboardingPage } from './OnboardingPage';

vi.mock('../../../app/store/AuthContext', () => ({ useAuth: vi.fn() }));

const updateOnboarding = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  updateOnboarding.mockResolvedValue({ user: {} });
});

afterEach(cleanup);

describe('OnboardingPage', () => {
  test('collects multiple roles and saves the first stage', async () => {
    useAuth.mockReturnValue({
      user: { onboarding: { status: 'not_started', roles: [], completedSteps: [] } },
      updateOnboarding,
    });

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <OnboardingPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('League manager'));
    fireEvent.click(screen.getByText('Player'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(updateOnboarding).toHaveBeenCalledWith({
        status: 'in_progress',
        roles: ['league_manager', 'player'],
        completedSteps: ['roles'],
      })
    );
    expect(await screen.findByText('Connect your sporty world.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open league admin' })).toHaveAttribute(
      'href',
      '/admin'
    );
    expect(screen.getByRole('link', { name: 'Find my profiles' })).toHaveAttribute(
      'href',
      '/home?tab=players'
    );
  });

  test('resumes the create/connect stage and completes setup', async () => {
    useAuth.mockReturnValue({
      user: {
        onboarding: {
          status: 'in_progress',
          roles: ['team_manager'],
          completedSteps: ['roles'],
        },
      },
      updateOnboarding,
    });

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <OnboardingPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Create a team' })).toHaveAttribute(
      'href',
      '/teams/new?redirectTo=%2Fonboarding%3Fstep%3Dprofiles'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));

    await waitFor(() =>
      expect(updateOnboarding).toHaveBeenCalledWith({
        status: 'completed',
        roles: ['team_manager'],
        completedSteps: ['roles', 'profiles'],
      })
    );
  });

  test('offers a browse-only role and tailors its create/connect action', async () => {
    useAuth.mockReturnValue({
      user: { onboarding: { status: 'not_started', roles: [], completedSteps: [] } },
      updateOnboarding,
    });

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <OnboardingPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Fan or spectator'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(updateOnboarding).toHaveBeenCalledWith({
        status: 'in_progress',
        roles: ['fan'],
        completedSteps: ['roles'],
      })
    );
    expect(await screen.findByRole('link', { name: 'Start browsing' })).toHaveAttribute(
      'href',
      '/home?tab=leagues'
    );
  });

  test('does not ask a browse-only user to create or connect a profile', async () => {
    useAuth.mockReturnValue({
      user: { onboarding: { status: 'in_progress', roles: ['fan'], completedSteps: ['roles'] } },
      updateOnboarding,
    });

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <OnboardingPage />
      </MemoryRouter>
    );

    expect(screen.queryByRole('link', { name: 'Create a team' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open league admin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Find my profiles' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start browsing' })).toBeInTheDocument();
  });
});

describe('getOnboardingHandoff', () => {
  test('sends a browse-only fan to the Pulse', () => {
    expect(getOnboardingHandoff(['fan'])).toBe('/pulse');
  });

  test('sends a player to My Sporty', () => {
    expect(getOnboardingHandoff(['player'])).toBe('/my-sporty');
    expect(getOnboardingHandoff(['player', 'fan'])).toBe('/my-sporty');
  });

  test('sends any manager role to Admin', () => {
    expect(getOnboardingHandoff(['league_manager'])).toBe('/admin');
    expect(getOnboardingHandoff(['league_team_manager'])).toBe('/admin');
    expect(getOnboardingHandoff(['team_manager'])).toBe('/admin');
    expect(getOnboardingHandoff(['team_manager', 'player', 'fan'])).toBe('/admin');
  });

  test('falls back to the Pulse when no role was chosen', () => {
    expect(getOnboardingHandoff([])).toBe('/pulse');
    expect(getOnboardingHandoff()).toBe('/pulse');
  });
});
