import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test } from 'vitest';
import { GameCardPost } from './GameCardPost';
import { PlayerCardPost } from './PlayerCardPost';
import { TeamCardPost } from './TeamCardPost';
import { gameCardFixture, playerCardFixture, teamCardFixture } from './cardFixtures';

describe('feed card posts', () => {
  afterEach(() => {
    cleanup();
  });

  test('player card falls back to team logo when player image is missing', () => {
    render(
      <MemoryRouter>
        <PlayerCardPost
          playerCard={{
            ...playerCardFixture,
            playerName: 'Jordan',
            playerImage: null,
            teamLogo: { url: 'https://example.com/team-logo.png' },
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
        <TeamCardPost teamCard={teamCardFixture} />
      </MemoryRouter>
    );

    expect(screen.getByAltText('TSW Blue card logo')).toHaveAttribute(
      'src',
      'https://example.com/team-logo.png'
    );
    expect(screen.getByText('Points')).toBeInTheDocument();
  });

  test('player preview mode renders a non-link card', () => {
    render(
      <MemoryRouter>
        <PlayerCardPost
          interactive={false}
          playerCard={{
            ...playerCardFixture,
            playerName: 'Jordan',
            playerImage: null,
            teamLogo: { url: 'https://example.com/team-logo.png' },
          }}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole('link', { name: 'Jordan' })).not.toBeInTheDocument();
    expect(screen.getByText('Jordan')).toBeInTheDocument();
    expect(screen.getByText('PPG')).toBeInTheDocument();
  });

  test('team preview mode renders a non-link card', () => {
    render(
      <MemoryRouter>
        <TeamCardPost interactive={false} teamCard={teamCardFixture} />
      </MemoryRouter>
    );

    expect(screen.queryByRole('link', { name: 'TSW Blue' })).not.toBeInTheDocument();
    expect(screen.getByText('TSW Blue')).toBeInTheDocument();
    expect(screen.getByText('FG2%')).toBeInTheDocument();
  });

  test('game card renders logo badge when available', () => {
    render(
      <MemoryRouter>
        <GameCardPost gameCard={gameCardFixture} />
      </MemoryRouter>
    );

    expect(screen.getByAltText('TSW Blue logo badge')).toHaveAttribute(
      'src',
      'https://example.com/team-logo.png'
    );
    expect(screen.getAllByText('70')).toHaveLength(2);
    expect(screen.getByText('61')).toBeInTheDocument();
    expect(screen.getByText('PTS')).toBeInTheDocument();
  });

  test('player card falls back to initials when both player image and team logo are missing', () => {
    render(
      <MemoryRouter>
        <PlayerCardPost
          playerCard={{
            ...playerCardFixture,
            playerName: 'Jordan Miles',
            playerImage: null,
            teamLogo: null,
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('JM')).toBeInTheDocument();
    expect(screen.getByText('PLAYER SPOTLIGHT')).toBeInTheDocument();
  });

  test('rendered card trio matches the broadcast card fixture snapshot', () => {
    const { container } = render(
      <MemoryRouter>
        <div className="space-y-4">
          <GameCardPost gameCard={gameCardFixture} />
          <PlayerCardPost playerCard={playerCardFixture} />
          <TeamCardPost teamCard={teamCardFixture} />
        </div>
      </MemoryRouter>
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
