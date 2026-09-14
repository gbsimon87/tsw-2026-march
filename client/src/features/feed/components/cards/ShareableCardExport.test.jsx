import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ShareableCardExport, ShareableCardPreview } from './ShareableCardExport';
import { SOCIAL_EXPORT_PRESETS } from './socialExportPresets';
import {
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  GAME_CAPTURE_SCALE,
  GAME_FRAME_HEIGHT,
  GAME_FRAME_WIDTH,
} from './shareExportTheme';
import {
  gameCardFixture,
  playerCardFixture,
  playerGameCardFixture,
  teamCardFixture,
} from '../posts/cardFixtures';
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

  it.each([
    ['story', 1080, 1920],
    ['link', 1200, 630],
  ])('frames the %s export at exactly %ix%i', (format, width, height) => {
    const { container } = renderExport({ type: 'game_card', gameCard: gameCardFixture, format });
    const root = container.firstChild;

    expect(root).toHaveStyle({ width: `${width}px`, height: `${height}px` });
    expect(root.dataset.exportWidth).toBe(String(width));
    expect(root.dataset.exportHeight).toBe(String(height));
    expect(Number(root.dataset.captureScale)).toBe(1);
    expect(root.querySelector('[data-safe-content]')).toHaveStyle({
      top: `${SOCIAL_EXPORT_PRESETS[format].safeArea.top}px`,
      left: `${SOCIAL_EXPORT_PRESETS[format].safeArea.left}px`,
    });
    expect(root.querySelector('[data-safe-area-overlay]')).toBeNull();
  });

  it.each(['story', 'link'])('shows a guide in the %s preview only', (format) => {
    const { container } = render(
      <MemoryRouter>
        <ShareableCardPreview type="game_card" gameCard={gameCardFixture} format={format} />
      </MemoryRouter>
    );

    expect(container.querySelector('[data-safe-area-overlay]')).not.toBeNull();
  });

  it.each(['story', 'link'])(
    'keeps long player and team names un-clamped in the %s export',
    (format) => {
      const longName = 'Northside Community Warriors Basketball Club and Athletic Association';
      const { container, getAllByText, rerender } = renderExport({
        type: 'player_card',
        playerCard: { ...playerCard, playerName: longName, teamName: longName },
        format,
      });

      expect(getAllByText(longName)[0]).toHaveStyle({ overflowWrap: 'anywhere' });
      expect(container.querySelector('[data-safe-content]')).not.toBeNull();

      rerender(
        <MemoryRouter>
          <ShareableCardExport
            type="team_card"
            teamCard={{ ...teamCardFixture, teamName: longName }}
            format={format}
          />
        </MemoryRouter>
      );
      expect(getAllByText(longName)[0]).toHaveStyle({ overflowWrap: 'anywhere' });
    }
  );

  it('falls back to initials if a preset portrait cannot load', () => {
    const { getByAltText, getByText } = renderExport({
      type: 'player_card',
      playerCard: playerCardFixture,
      format: 'story',
    });

    fireEvent.error(getByAltText('Jordan Miles mark'));
    expect(getByText('JM')).toBeInTheDocument();
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

// Social backlog rank 2 — the per-game player stat card. Deliberately a
// different composition from the season-average player spotlight above.
describe('ShareableCardExport — player_game_card', () => {
  it('inscribes the game line, not the season averages', () => {
    const { getByText, queryByText } = renderExport({
      type: 'player_game_card',
      playerGameCard: playerGameCardFixture,
    });

    expect(getByText('Game performance')).toBeInTheDocument();
    expect(queryByText('Season averages')).not.toBeInTheDocument();
    expect(getByText('Jordan Miles')).toBeInTheDocument();
    expect(getByText('Points')).toBeInTheDocument();
    expect(getByText('24')).toBeInTheDocument();
    expect(getByText('8')).toBeInTheDocument();
    expect(getByText('5')).toBeInTheDocument();
  });

  it('names the opponent and the result the viewer needs for context', () => {
    const { getByText } = renderExport({
      type: 'player_game_card',
      playerGameCard: playerGameCardFixture,
    });

    expect(getByText(/TSW Blue vs Falcons/)).toBeInTheDocument();
    expect(getByText('W 70–61')).toBeInTheDocument();
  });

  it('adds the picked context stat as a fourth row', () => {
    const { getByText } = renderExport({
      type: 'player_game_card',
      playerGameCard: playerGameCardFixture,
    });

    // fg3m of 3 clears the threshold, so threes win the slot.
    expect(getByText('3-pointers')).toBeInTheDocument();
  });

  it('omits the result line when the opponent score was never tracked', () => {
    const { queryByText } = renderExport({
      type: 'player_game_card',
      playerGameCard: { ...playerGameCardFixture, resultLabel: null },
    });

    expect(queryByText(/^[WLD] /)).not.toBeInTheDocument();
  });

  it('falls back to initials with no photo and no team logo', () => {
    const { getByText } = renderExport({
      type: 'player_game_card',
      playerGameCard: { ...playerGameCardFixture, playerImage: null, teamLogo: null },
    });

    expect(getByText('JM')).toBeInTheDocument();
  });

  it('frames the 4:5 export at exactly 1080x1350', () => {
    const { container } = renderExport({
      type: 'player_game_card',
      playerGameCard: playerGameCardFixture,
    });
    const root = container.firstChild;

    expect(root).toHaveStyle({ width: `${EXPORT_WIDTH}px`, height: `${EXPORT_HEIGHT}px` });
  });

  it.each([
    ['story', 1080, 1920],
    ['link', 1200, 630],
  ])('frames the %s export at exactly %ix%i', (format, width, height) => {
    const { container } = renderExport({
      type: 'player_game_card',
      playerGameCard: playerGameCardFixture,
      format,
    });
    const root = container.firstChild;

    expect(root).toHaveStyle({ width: `${width}px`, height: `${height}px` });
    expect(root.dataset.exportWidth).toBe(String(width));
    expect(root.dataset.exportHeight).toBe(String(height));
    expect(root.querySelector('[data-safe-content]')).not.toBeNull();
  });

  it.each(['story', 'link'])('keeps a long name un-clamped in the %s export', (format) => {
    const longName = 'Bartholomew Fitzwilliam-Montgomery III';
    const { getAllByText } = renderExport({
      type: 'player_game_card',
      playerGameCard: { ...playerGameCardFixture, playerName: longName },
      format,
    });

    expect(getAllByText(longName)[0]).toHaveStyle({ overflowWrap: 'anywhere' });
  });
});
