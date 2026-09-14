import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test } from 'vitest';
import { GameCardPost } from './GameCardPost';
import { PlayerCardPost } from './PlayerCardPost';
import { PlayerGameCardPost } from './PlayerGameCardPost';
import { FullScreenPlayerGameCard } from './FullScreenPlayerGameCard';
import { TeamCardPost } from './TeamCardPost';
import {
  gameCardFixture,
  playerCardFixture,
  playerGameCardFixture,
  teamCardFixture,
} from './cardFixtures';

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

  test('game preview mode renders a non-link card', () => {
    const { container } = render(
      <MemoryRouter>
        <GameCardPost gameCard={gameCardFixture} interactive={false} />
      </MemoryRouter>
    );

    expect(container.querySelector('a')).not.toBeInTheDocument();
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

// Social backlog rank 2 — the per-game player card in The Pulse.
describe('player game card post', () => {
  afterEach(() => {
    cleanup();
  });

  test('leads with the player, the matchup and the game line', () => {
    render(
      <MemoryRouter>
        <PlayerGameCardPost playerGameCard={playerGameCardFixture} />
      </MemoryRouter>
    );

    expect(screen.getByText('Jordan Miles')).toBeInTheDocument();
    expect(screen.getByText(/TSW Blue vs Falcons/)).toBeInTheDocument();
    expect(screen.getByText('W 70–61')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('PTS')).toBeInTheDocument();
  });

  test('shows the picked context stat beside points, rebounds and assists', () => {
    render(
      <MemoryRouter>
        <PlayerGameCardPost playerGameCard={playerGameCardFixture} />
      </MemoryRouter>
    );

    expect(screen.getByText('3-pointers')).toBeInTheDocument();
  });

  test('says the mark is the team crest rather than passing it off as a face', () => {
    render(
      <MemoryRouter>
        <PlayerGameCardPost playerGameCard={playerGameCardFixture} />
      </MemoryRouter>
    );

    expect(screen.getByText(/team mark/i)).toBeInTheDocument();
  });

  test('links through to the game it came from', () => {
    render(
      <MemoryRouter>
        <PlayerGameCardPost playerGameCard={playerGameCardFixture} />
      </MemoryRouter>
    );

    expect(screen.getByRole('link')).toHaveAttribute('href', '/games/g1');
  });

  test('renders a non-link card in preview mode', () => {
    render(
      <MemoryRouter>
        <PlayerGameCardPost playerGameCard={playerGameCardFixture} interactive={false} />
      </MemoryRouter>
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Jordan Miles')).toBeInTheDocument();
  });

  test('full-screen slide carries the same line', () => {
    render(
      <MemoryRouter>
        <FullScreenPlayerGameCard playerGameCard={playerGameCardFixture} />
      </MemoryRouter>
    );

    expect(screen.getByText('Jordan Miles')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
  });

  test('full-screen slide degrades to a message when the card is missing', () => {
    render(
      <MemoryRouter>
        <FullScreenPlayerGameCard playerGameCard={null} />
      </MemoryRouter>
    );

    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });
});
