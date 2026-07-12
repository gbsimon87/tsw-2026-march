import { describe, expect, test, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProfileCard } from './ProfileCard';

const baseProfile = {
  id: 'lp-1',
  displayName: 'Jamie Rivera',
  jerseyNumber: 7,
  position: 'PG',
  memberRoleLabel: 'Player',
  team: { name: 'Hawks', logo: null },
  league: { name: 'City League', seasonLabel: 'Spring 2026' },
  profileHref: '/league/city-league/teams/hawks/players/lp-1',
};

function renderCard(profile) {
  return render(
    <MemoryRouter>
      <ProfileCard profile={profile} avatarUrl={null} />
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
});

describe('ProfileCard', () => {
  test('renders averages when a summary is present', () => {
    renderCard({
      ...baseProfile,
      summary: { gamesCount: 4, pointsPerGame: 10, reboundsPerGame: 5, assistsPerGame: 2 },
    });

    expect(screen.getByText('4 GP')).toBeInTheDocument();
    expect(screen.getByText(/10\.0 PPG/)).toBeInTheDocument();
    expect(screen.getByText(/5\.0 RPG/)).toBeInTheDocument();
    expect(screen.getByText(/2\.0 APG/)).toBeInTheDocument();
  });

  test('renders without a stat line when summary is absent', () => {
    renderCard(baseProfile);

    expect(screen.queryByText(/GP$/)).not.toBeInTheDocument();
  });
});
