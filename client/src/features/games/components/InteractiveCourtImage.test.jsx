import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { InteractiveCourtImage } from './InteractiveCourtImage';

describe('InteractiveCourtImage', () => {
  afterEach(() => {
    cleanup();
  });

  test('toggles calibration overlay', () => {
    render(<InteractiveCourtImage selectedPoint={null} onSelect={vi.fn()} />);

    expect(screen.queryByTestId('calibration-rect')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show calibration/i }));

    expect(screen.getByTestId('calibration-rect')).toBeInTheDocument();
    expect(screen.getByTestId('calibration-midline-horizontal')).toBeInTheDocument();
    expect(screen.getByTestId('calibration-midline-vertical')).toBeInTheDocument();
    expect(screen.getByTestId('calibration-north-ft')).toBeInTheDocument();
    expect(screen.getByTestId('calibration-south-ft')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Hide calibration/i }));
    expect(screen.queryByTestId('calibration-rect')).not.toBeInTheDocument();
  });

  test('updates calibration values when dragging a handle', () => {
    render(<InteractiveCourtImage selectedPoint={null} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Show calibration/i }));

    const before = screen.getByTestId('calibration-values').textContent;
    const handle = screen.getByRole('button', { name: /Top left calibration handle/i });

    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 130, clientY: 130 });
    fireEvent.pointerUp(window);

    const after = screen.getByTestId('calibration-values').textContent;
    expect(after).not.toEqual(before);
  });
});
