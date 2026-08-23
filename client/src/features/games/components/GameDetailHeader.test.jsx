import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { GameDetailHeader } from './GameDetailHeader';

// A league team's `team.id` is a LeagueTeam _id, not a Team _id — the league
// branch of getGameDetail (games.service.js) returns `String(trackedTeam._id)`
// alongside `trackedTeam.slug`. Linking it into /teams/:teamId hits
// PublicTeamPage, which only ever finds docs in the standalone `teams`
// collection, so it renders "Team not found".
const leagueTeam = {
  id: '6a8a234029bdac3b70839398',
  slug: 'bournemouth-bears',
  name: 'Bournemouth Bears',
};
const league = {
  id: '6a8a263499aed26ab4650f04',
  slug: 'dorset-basketball-association',
  name: 'Dorset Basketball Association',
};
const standaloneTeam = { id: '507f1f77bcf86cd799439011', name: 'Weekend Warriors' };

function renderHeader(props) {
  return render(
    <MemoryRouter>
      <GameDetailHeader gameId="game-1" gameSummary={{}} {...props} />
    </MemoryRouter>
  );
}

describe('GameDetailHeader View Team link', () => {
  test('points a one-sided LEAGUE game at the league team page, not the standalone team page', () => {
    renderHeader({
      game: { id: 'game-1', gameContext: 'league', trackingMode: 'one_sided', status: 'scheduled' },
      team: leagueTeam,
      league,
      isDualTeam: false,
    });

    const link = screen.getByRole('link', { name: 'View Team' });
    expect(link).toHaveAttribute(
      'href',
      '/league/dorset-basketball-association/teams/bournemouth-bears'
    );
    expect(link).not.toHaveAttribute('href', `/teams/${leagueTeam.id}`);
  });

  test('still points a one-sided STANDALONE game at the standalone team page', () => {
    renderHeader({
      game: {
        id: 'game-1',
        gameContext: 'standalone',
        trackingMode: 'one_sided',
        status: 'completed',
      },
      team: standaloneTeam,
      league: null,
      isDualTeam: false,
    });

    expect(screen.getByRole('link', { name: 'View Team' })).toHaveAttribute(
      'href',
      `/teams/${standaloneTeam.id}`
    );
  });

  test('renders no View Team link for a dual-team game', () => {
    renderHeader({
      game: { id: 'game-1', gameContext: 'league', trackingMode: 'dual_team', status: 'completed' },
      team: leagueTeam,
      league,
      participants: {
        home: { displayName: 'Bournemouth Bears' },
        away: { displayName: 'BG Suns 1' },
      },
      isDualTeam: true,
    });

    expect(screen.queryByRole('link', { name: 'View Team' })).not.toBeInTheDocument();
  });

  // A league game whose slugs are missing (older docs predating slug storage —
  // see OPT-022) must not fall back to the broken /teams/:leagueTeamId link.
  test('renders no View Team link for a league game with no team slug', () => {
    renderHeader({
      game: { id: 'game-1', gameContext: 'league', trackingMode: 'one_sided', status: 'scheduled' },
      team: { id: leagueTeam.id, name: 'Bournemouth Bears' },
      league,
      isDualTeam: false,
    });

    expect(screen.queryByRole('link', { name: 'View Team' })).not.toBeInTheDocument();
  });
});

describe('GameDetailHeader tracking button', () => {
  // A scheduled fixture has not started, so "Continue Tracking" misdescribes it.
  // The status only becomes in_progress when the clock starts (games.service.js),
  // so the label has to distinguish starting from resuming.
  test('reads Start Tracking for a scheduled game', () => {
    renderHeader({
      game: { id: 'game-1', gameContext: 'league', trackingMode: 'dual_team', status: 'scheduled' },
      team: leagueTeam,
      league,
      isDualTeam: false,
      canContinueTracking: true,
    });

    expect(screen.getByRole('link', { name: 'Start Tracking' })).toHaveAttribute(
      'href',
      '/games/game-1/track'
    );
    expect(screen.queryByRole('link', { name: 'Continue Tracking' })).not.toBeInTheDocument();
  });

  test('reads Continue Tracking for a game already in progress', () => {
    renderHeader({
      game: {
        id: 'game-1',
        gameContext: 'league',
        trackingMode: 'dual_team',
        status: 'in_progress',
      },
      team: leagueTeam,
      league,
      isDualTeam: false,
      canContinueTracking: true,
    });

    expect(screen.getByRole('link', { name: 'Continue Tracking' })).toBeInTheDocument();
  });
});
