import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { GameReplayPanel } from './GameReplayPanel';
import { RecapShotSnapshot } from './RecapShotSnapshot';

const SHOT = {
  id: 'event-1',
  playerId: 'p1',
  playerName: 'Alex',
  statType: 'FG2_MADE',
  zoneId: 'PAINT',
  x: 50,
  y: 20,
};

function snapshot(courtLayoutId) {
  return {
    ...(courtLayoutId ? { courtLayoutId } : {}),
    made: 1,
    missed: 0,
    events: [SHOT],
  };
}

describe('court layout rendering in game history', () => {
  afterEach(cleanup);

  test('a legacy snapshot renders the original court', () => {
    render(<RecapShotSnapshot shotSnapshot={snapshot()} />);

    expect(screen.getByAltText('Game recap court').getAttribute('src')).toContain(
      'basketball_court_1'
    );
  });

  test('a court-v2 snapshot renders the new court', () => {
    render(<RecapShotSnapshot shotSnapshot={snapshot('court-v2')} />);

    expect(screen.getByAltText('Game recap court').getAttribute('src')).toContain(
      'basketball_court_2'
    );
  });

  test('an unknown layout still renders, falling back to the original court', () => {
    render(<RecapShotSnapshot shotSnapshot={snapshot('court-v9')} />);

    expect(screen.getByAltText('Game recap court').getAttribute('src')).toContain(
      'basketball_court_1'
    );
  });

  test('an explicit prop overrides a snapshot that predates self-description', () => {
    render(<RecapShotSnapshot shotSnapshot={snapshot()} courtLayoutId="court-v2" />);

    expect(screen.getByAltText('Game recap court').getAttribute('src')).toContain(
      'basketball_court_2'
    );
  });

  test('markers stay at their stored percentages regardless of layout', () => {
    render(<RecapShotSnapshot shotSnapshot={snapshot('court-v2')} />);

    const marker = screen.getByTestId('recap-shot-made-marker');

    expect(marker.style.left).toBe('calc(50% + 0px)');
    expect(marker.style.top).toBe('calc(20% + 0px)');
  });

  test('replay renders each game on its own court', () => {
    const { unmount } = render(<GameReplayPanel events={[SHOT]} players={[]} />);
    expect(screen.getByAltText('Replay court').getAttribute('src')).toContain('basketball_court_1');
    unmount();

    render(<GameReplayPanel events={[SHOT]} players={[]} courtLayoutId="court-v2" />);
    expect(screen.getByAltText('Replay court').getAttribute('src')).toContain('basketball_court_2');
  });
});
