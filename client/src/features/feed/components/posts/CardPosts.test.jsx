import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test } from 'vitest';
import { GameCardPost } from './GameCardPost';
import { PlayerCardPost } from './PlayerCardPost';
import { TeamCardPost } from './TeamCardPost';

describe('feed card posts', () => {
  afterEach(() => {
    cleanup();
  });

  test('player card falls back to team logo when player image is missing', () => {
    render(
      <MemoryRouter>
        <PlayerCardPost
          playerCard={{
            playerUrl: '/teams/t1/players/p1',
            playerName: 'Jordan',
            teamName: 'TSW Blue',
            playerImage: null,
            teamLogo: { url: 'https://example.com/team-logo.png' },
            summary: {
              pointsPerGame: 12,
              reboundsPerGame: 5,
              assistsPerGame: 4,
            },
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByAltText('Jordan card avatar')).toHaveAttribute(
      'src',
      'https://example.com/team-logo.png'
    );
  });

  test('team card renders logo', () => {
    render(
      <MemoryRouter>
        <TeamCardPost
          teamCard={{
            teamUrl: '/teams/t1',
            teamName: 'TSW Blue',
            teamLogo: { url: 'https://example.com/team-logo.png' },
            summary: {
              gamesCount: 12,
              points: 88,
              fg2: { percentage: 50 },
              fg3: { percentage: 40 },
              ft: { percentage: 75 },
            },
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByAltText('TSW Blue card logo')).toHaveAttribute(
      'src',
      'https://example.com/team-logo.png'
    );
  });

  test('player preview mode renders a non-link card', () => {
    render(
      <MemoryRouter>
        <PlayerCardPost
          interactive={false}
          playerCard={{
            playerUrl: '/teams/t1/players/p1',
            playerName: 'Jordan',
            teamName: 'TSW Blue',
            playerImage: null,
            teamLogo: { url: 'https://example.com/team-logo.png' },
            summary: {
              pointsPerGame: 12,
              reboundsPerGame: 5,
              assistsPerGame: 4,
            },
          }}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole('link', { name: 'Jordan' })).not.toBeInTheDocument();
    expect(screen.getByText('Jordan')).toBeInTheDocument();
  });

  test('team preview mode renders a non-link card', () => {
    render(
      <MemoryRouter>
        <TeamCardPost
          interactive={false}
          teamCard={{
            teamUrl: '/teams/t1',
            teamName: 'TSW Blue',
            teamLogo: { url: 'https://example.com/team-logo.png' },
            summary: {
              gamesCount: 12,
              points: 88,
              fg2: { percentage: 50 },
              fg3: { percentage: 40 },
              ft: { percentage: 75 },
            },
          }}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole('link', { name: 'TSW Blue' })).not.toBeInTheDocument();
    expect(screen.getByText('TSW Blue')).toBeInTheDocument();
  });

  test('game card renders logo badge when available', () => {
    render(
      <MemoryRouter>
        <GameCardPost
          gameCard={{
            gameUrl: '/games/g1',
            teamName: 'TSW Blue',
            teamLogo: { url: 'https://example.com/team-logo.png' },
            recap: {
              team: { name: 'TSW Blue', points: 70 },
              opponent: { name: 'Falcons' },
              teamStats: {
                points: 70,
                reb: 10,
                ast: 12,
                fg2: { percentage: 50 },
                fg3: { percentage: 40 },
                ft: { percentage: 75 },
              },
              topPerformers: [],
            },
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByAltText('TSW Blue logo badge')).toHaveAttribute(
      'src',
      'https://example.com/team-logo.png'
    );
  });
});
