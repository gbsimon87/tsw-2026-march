import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
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
  test('confirms and finishes the current quarter', () => {
    const onCommand = vi.fn();
    render(<GameClockControls game={game()} onCommand={onCommand} />);

    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByLabelText('Game clock')).toHaveClass('text-3xl');
    fireEvent.click(screen.getByRole('button', { name: 'Finish quarter' }));

    expect(screen.getByRole('dialog', { name: 'Finish Q2?' })).toBeInTheDocument();
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Finish period' }));
    expect(onCommand).toHaveBeenCalledWith({ action: 'finish_segment' });
  });

  test('labels overtime correctly and honors cancellation', () => {
    const onCommand = vi.fn();
    render(
      <GameClockControls
        game={game({ segmentKind: 'overtime', segmentNumber: 3 })}
        onCommand={onCommand}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Finish overtime' }));

    expect(screen.getByRole('dialog', { name: 'Finish OT3?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep tracking' }));
    expect(screen.queryByRole('dialog', { name: 'Finish OT3?' })).not.toBeInTheDocument();
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
