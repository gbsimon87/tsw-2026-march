import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { InteractiveCourtSvg } from './InteractiveCourtSvg';

describe('InteractiveCourtSvg', () => {
  test('renders top/bottom 3-point arcs and free-throw key arcs', () => {
    render(<InteractiveCourtSvg selectedPoint={null} onSelect={vi.fn()} />);

    const topArc = screen.getByTestId('top-three-arc');
    const bottomArc = screen.getByTestId('bottom-three-arc');
    const topKeyArc = screen.getByTestId('top-key-arc');
    const bottomKeyArc = screen.getByTestId('bottom-key-arc');

    expect(topArc).toBeInTheDocument();
    expect(bottomArc).toBeInTheDocument();
    expect(topKeyArc).toBeInTheDocument();
    expect(bottomKeyArc).toBeInTheDocument();

    expect(topArc.getAttribute('d')).toContain('A');
    expect(bottomArc.getAttribute('d')).toContain('A');
    expect(topKeyArc.getAttribute('d')).toContain('A');
    expect(bottomKeyArc.getAttribute('d')).toContain('A');
  });
});
