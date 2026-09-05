import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ShareableCardExport } from './ShareableCardExport';
import {
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  GAME_CAPTURE_SCALE,
  GAME_FRAME_HEIGHT,
  GAME_FRAME_WIDTH,
} from './shareExportTheme';
import { gameCardFixture, playerCardFixture, teamCardFixture } from '../posts/cardFixtures';
import { GameCardPost } from '../posts/GameCardPost';

const playerCard = {
  playerName: 'Jordan Lee',
  teamName: 'Falcons',
  jerseyNumber: 23,
  playerImage: null,
  teamLogo: null,
  teamColors: [],
  summary: { pointsPerGame: 18.2, reboundsPerGame: 6.1, assistsPerGame: 4.4 },
};

// A team with no logo falls back to initials, which is the box the operator
// reported the misalignment in.
const noLogoGameCard = { ...gameCardFixture, teamLogo: null };

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

  it('exports the game card The Pulse renders, inside a TSW frame', () => {
    const { getAllByText, getByText } = renderExport({
      type: 'game_card',
      gameCard: gameCardFixture,
    });

    // The card itself — same component, same copy, as the operator approved.
    expect(getByText('Game Recap')).toBeInTheDocument();
    expect(getByText('TSW Blue')).toBeInTheDocument();
    expect(getByText('Falcons')).toBeInTheDocument();
    // 70 is both the winning score and the PTS pill on this fixture.
    expect(getAllByText('70')).toHaveLength(2);
    expect(getByText('61')).toBeInTheDocument();
    expect(getByText('Jordan Miles led the way with 24 PTS.')).toBeInTheDocument();

    // The frame around it.
    expect(getByText('The Sporty Way')).toBeInTheDocument();
    expect(getByText('thesportyway.com')).toBeInTheDocument();
  });

  it('frames the game card at a size the capture scale turns into 1080x1350', () => {
    const { container } = renderExport({ type: 'game_card', gameCard: gameCardFixture });
    const root = container.firstChild;

    // Instagram rejects anything off 4:5, and the upload service checks the
    // stored dimensions, so the frame and its declared scale have to multiply
    // out exactly. Guarding the product, not the individual numbers.
    expect(root).toHaveStyle({
      width: `${GAME_FRAME_WIDTH}px`,
      height: `${GAME_FRAME_HEIGHT}px`,
    });
    expect(Number(root.dataset.captureScale)).toBe(GAME_CAPTURE_SCALE);
    expect(GAME_FRAME_WIDTH * GAME_CAPTURE_SCALE).toBe(EXPORT_WIDTH);
    expect(GAME_FRAME_HEIGHT * GAME_CAPTURE_SCALE).toBe(EXPORT_HEIGHT);
  });

  it('drops the CSS blur html2canvas cannot rasterise from the game export', () => {
    const { container } = renderExport({ type: 'game_card', gameCard: gameCardFixture });

    // html2canvas ignores `filter`, so a blurred glow captures as a hard disc.
    // The export-safe backdrop swaps it for a gradient that does rasterise.
    expect(container.querySelector('.blur-3xl')).toBeNull();
  });

  it('lifts text out of the fixed-height boxes html2canvas draws it low in', () => {
    const { container } = renderExport({ type: 'game_card', gameCard: noLogoGameCard });

    // html2canvas puts every glyph run a constant 0.367em below the browser's
    // position. Harmless in normal flow, but it pushed the initials and the
    // date out of centre in the two boxes whose height does not move with them.
    const initials = screen.getByText('TB');
    expect(initials.tagName).toBe('SPAN');
    expect(initials).toHaveStyle({ position: 'relative', top: '-0.367em' });

    const date = container.querySelector('.rounded-full span');
    expect(date).toHaveStyle({ position: 'relative', top: '-0.367em' });
  });

  it("leaves the live Pulse card on the browser's own baseline", () => {
    render(
      <MemoryRouter>
        <GameCardPost gameCard={noLogoGameCard} interactive={false} />
      </MemoryRouter>
    );

    expect(screen.getByText('TB')).not.toHaveStyle({ top: '-0.367em' });
  });

  it('keeps the blur on the live Pulse card', () => {
    const { container } = render(
      <MemoryRouter>
        <GameCardPost gameCard={gameCardFixture} interactive={false} />
      </MemoryRouter>
    );

    expect(container.querySelector('.blur-3xl')).not.toBeNull();
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
