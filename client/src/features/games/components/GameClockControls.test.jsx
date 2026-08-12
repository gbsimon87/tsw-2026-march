import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { GameClockControls } from './GameClockControls';

function game(clockOverrides = {}, formatOverrides = {}) {
  return {
    gameFormat: {
      regulationSegmentType: 'quarter',
      regulationSegmentDurationSeconds: 600,
      overtimeDurationSeconds: 300,
      ...formatOverrides,
    },
    clock: {
      status: 'paused',
      segmentKind: 'regulation',
      segmentNumber: 2,
      remainingMilliseconds: 125000,
      runningSince: null,
      ...clockOverrides,
    },
  };
}

describe('GameClockControls manual period finish', () => {
  afterEach(() => vi.restoreAllMocks());

  test('confirms and finishes the current quarter', () => {
    const onCommand = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GameClockControls game={game()} onCommand={onCommand} />);

    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByLabelText('Game clock')).toHaveClass('text-3xl');
    fireEvent.click(screen.getByRole('button', { name: 'Finish quarter' }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Finish Q2 now? The game clock will be set to 0.0.'
    );
    expect(onCommand).toHaveBeenCalledWith({ action: 'finish_segment' });
  });

  test('labels overtime correctly and honors cancellation', () => {
    const onCommand = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <GameClockControls
        game={game({ segmentKind: 'overtime', segmentNumber: 3 })}
        onCommand={onCommand}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Finish overtime' }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Finish OT3 now? The game clock will be set to 0.0.'
    );
    expect(onCommand).not.toHaveBeenCalled();
  });

  test('does not show the action before a period starts or after it completes', () => {
    const { rerender } = render(
      <GameClockControls game={game({ status: 'ready' })} onCommand={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: /Finish/ })).not.toBeInTheDocument();

    rerender(
      <GameClockControls
        game={game({ status: 'segment_complete', remainingMilliseconds: 0 })}
        onCommand={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /Finish/ })).not.toBeInTheDocument();
  });
});
