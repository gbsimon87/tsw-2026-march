import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { CaptionAssistant } from './CaptionAssistant';

const ORIGIN = 'https://dev.thesportyway.com';

const playerGameCard = {
  type: 'player_game_card',
  playerGameCard: {
    gameUrl: '/games/g1',
    playerName: 'Jordan Blake',
    jerseyNumber: 7,
    teamName: 'TSW Blue',
    opponentName: 'Falcons',
    resultLabel: 'W 70–61',
    playedOn: '2026-09-12T19:30:00.000Z',
    imageFallback: 'player',
    stats: { points: 28, reb: 9, ast: 6, fg2m: 5, fg2a: 9, fg3m: 4, fg3a: 7 },
  },
};

function renderAssistant(props = {}) {
  return render(
    <CaptionAssistant source={playerGameCard} origin={ORIGIN} defaultOpen {...props} />
  );
}

describe('CaptionAssistant', () => {
  let writeText;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('renders the caption, tags and alt text generated from the card', () => {
    renderAssistant();

    expect(screen.getByLabelText('Generated caption').value).toContain(
      'Jordan Blake: 28 PTS, 9 REB, 6 AST'
    );
    expect(screen.getByText('#JordanBlake #TSWBlue #Basketball #TheSportyWay')).toBeVisible();
    expect(screen.getByText(/Game stat card for Jordan Blake #7 of TSW Blue/)).toBeVisible();
  });

  test('copies each part on its own', async () => {
    renderAssistant();

    fireEvent.click(screen.getByRole('button', { name: 'Copy alt text' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Game stat card'))
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy hashtags' }));
    expect(writeText).toHaveBeenLastCalledWith('#JordanBlake #TSWBlue #Basketball #TheSportyWay');
  });

  test('copies what the operator edited, not what was generated', async () => {
    renderAssistant();
    const field = screen.getByLabelText('Generated caption');

    fireEvent.change(field, { target: { value: 'My own words.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy caption' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('My own words.'));

    // And the generated version is one click away again.
    fireEvent.click(screen.getByRole('button', { name: 'Reset to generated caption' }));
    expect(field.value).toContain('Jordan Blake: 28 PTS');
  });

  test('says a copy could not happen rather than failing silently', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    renderAssistant();

    fireEvent.click(screen.getByRole('button', { name: 'Copy hashtags' }));

    // Every local dev server is plain http, where there is no clipboard API.
    expect(await screen.findByRole('button', { name: 'Copy hashtags' })).toHaveTextContent(
      'Select and copy'
    );
  });

  test('names the TSW account only, because no handle is recorded for anyone else', () => {
    renderAssistant();

    expect(screen.getByText('@TheSportyWay')).toBeVisible();
    expect(screen.getByText(/handles are not recorded in TSW yet/i)).toBeVisible();
  });

  test('renders nothing for a post that is not an exportable card', () => {
    const { container } = render(
      <CaptionAssistant source={{ type: 'image', image: { url: 'x' } }} origin={ORIGIN} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  test('does not copy a stale human caption after a player is restricted', () => {
    renderAssistant({
      lead: 'Jordan Blake is our star',
      marketing: {
        canFeature: true,
        scope: 'league',
        restrictedPlayerIds: ['p1'],
      },
    });

    expect(screen.getByLabelText('Generated caption').value).not.toContain('Jordan Blake');
    expect(screen.getByText(/Game stat card for J\. B\./)).toBeVisible();
  });
});
