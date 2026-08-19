import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ShareableCardExport } from './ShareableCardExport';
import { gameCardFixture, playerCardFixture, teamCardFixture } from '../posts/cardFixtures';

const playerCard = {
  playerName: 'Jordan Lee',
  teamName: 'Falcons',
  jerseyNumber: 23,
  playerImage: null,
  teamLogo: null,
  teamColors: [],
  summary: { pointsPerGame: 18.2, reboundsPerGame: 6.1, assistsPerGame: 4.4 },
};

function renderExport(props) {
  return render(
    <MemoryRouter>
      <ShareableCardExport {...props} />
    </MemoryRouter>
  );
}

describe('ShareableCardExport', () => {
  it('renders a player card export with the TSW watermark', () => {
    const { container, getByText } = renderExport({ type: 'player_card', playerCard });
    expect(getByText(/the sporty way/i)).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('inscribes the player averages as a labelled ledger', () => {
    const { getByText } = renderExport({ type: 'player_card', playerCard });

    expect(getByText('Season averages')).toBeInTheDocument();
    expect(getByText('No. 23')).toBeInTheDocument();
    expect(getByText('Jordan Lee')).toBeInTheDocument();
    expect(getByText('Points per game')).toBeInTheDocument();
    expect(getByText('18.2')).toBeInTheDocument();
    expect(getByText('6.1')).toBeInTheDocument();
    expect(getByText('4.4')).toBeInTheDocument();
  });

  it('omits the jersey serial when the player has no number', () => {
    const { queryByText } = renderExport({
      type: 'player_card',
      playerCard: { ...playerCard, jerseyNumber: null },
    });

    expect(queryByText(/^No\./)).not.toBeInTheDocument();
  });

  it('leads a game export with the winning margin and both scores', () => {
    const { getByText } = renderExport({ type: 'game_card', gameCard: gameCardFixture });

    expect(getByText('Final score')).toBeInTheDocument();
    expect(getByText('Won by 9')).toBeInTheDocument();
    expect(getByText('70')).toBeInTheDocument();
    expect(getByText('61')).toBeInTheDocument();
    expect(getByText('Top scorer')).toBeInTheDocument();
    expect(getByText('Jordan Miles, 24 pts')).toBeInTheDocument();
  });

  it('states the margin from the losing side without inverting the score', () => {
    const { getByText } = renderExport({
      type: 'game_card',
      gameCard: {
        ...gameCardFixture,
        recap: {
          ...gameCardFixture.recap,
          team: { name: 'TSW Blue', points: 61 },
          opponent: { name: 'Falcons', points: 70 },
        },
      },
    });

    expect(getByText('Lost by 9')).toBeInTheDocument();
  });

  it('reports a drawn game as a draw', () => {
    const { getByText } = renderExport({
      type: 'game_card',
      gameCard: {
        ...gameCardFixture,
        recap: {
          ...gameCardFixture.recap,
          team: { name: 'TSW Blue', points: 61 },
          opponent: { name: 'Falcons', points: 61 },
        },
      },
    });

    expect(getByText('Drew')).toBeInTheDocument();
  });

  it('renders the team shooting summary and pluralises the game count', () => {
    const { getByText } = renderExport({ type: 'team_card', teamCard: teamCardFixture });

    expect(getByText('Season summary')).toBeInTheDocument();
    expect(getByText('12 games')).toBeInTheDocument();
    expect(getByText('Free throw')).toBeInTheDocument();
    expect(getByText('75%')).toBeInTheDocument();
  });

  it('uses the singular for a team with one game played', () => {
    const { getByText } = renderExport({
      type: 'team_card',
      teamCard: { ...teamCardFixture, summary: { ...teamCardFixture.summary, gamesCount: 1 } },
    });

    expect(getByText('1 game')).toBeInTheDocument();
  });

  it('falls back to initials when the player has no portrait or team logo', () => {
    const { getByText } = renderExport({
      type: 'player_card',
      playerCard: { ...playerCardFixture, playerImage: null, teamLogo: null },
    });
    expect(getByText('JM')).toBeInTheDocument();
  });

  it('uses the team logo as the portrait when the player has no photo', () => {
    const { getByAltText } = renderExport({ type: 'player_card', playerCard: playerCardFixture });
    expect(getByAltText('Jordan Miles share card portrait')).toHaveAttribute(
      'src',
      playerCardFixture.teamLogo.url
    );
  });

  it('renders nothing for an unknown type', () => {
    const { container } = renderExport({ type: 'nope' });
    expect(container.firstChild).toBeNull();
  });
});
