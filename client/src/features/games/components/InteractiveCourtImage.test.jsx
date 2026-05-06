import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { InteractiveCourtImage } from './InteractiveCourtImage';

const originalMatchMedia = window.matchMedia;

function setElementRect(element, rect) {
  element.getBoundingClientRect = vi.fn(() => ({
    left: 0,
    top: 0,
    right: rect.width,
    bottom: rect.height,
    x: 0,
    y: 0,
    width: rect.width,
    height: rect.height,
    toJSON: () => {},
  }));
}

function mockMatchMedia(matches) {
  const mediaQueryList = {
    matches,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  window.matchMedia = vi.fn(() => mediaQueryList);

  return mediaQueryList;
}

describe('InteractiveCourtImage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.matchMedia = originalMatchMedia;
  });

  test('renders the court image', () => {
    render(<InteractiveCourtImage selectedPoint={null} onSelect={vi.fn()} />);

    expect(screen.getByRole('img', { name: /Basketball court image/i })).toBeInTheDocument();
    expect(screen.getByAltText(/Basketball court/i)).toBeInTheDocument();
  });

  test('maps selected points without rotation', () => {
    const onSelect = vi.fn();
    render(<InteractiveCourtImage selectedPoint={null} onSelect={onSelect} />);

    const image = screen.getByTestId('interactive-court-image');
    setElementRect(image, { width: 200, height: 400 });

    fireEvent.click(image, { clientX: 50, clientY: 300 });

    expect(onSelect).toHaveBeenCalledWith({ x: 25, y: 75 });
  });

  test('maps selected points when rotated right', () => {
    const onSelect = vi.fn();
    render(<InteractiveCourtImage selectedPoint={null} onSelect={onSelect} rotate90 />);

    const image = screen.getByTestId('interactive-court-image');
    setElementRect(image, { width: 200, height: 400 });

    fireEvent.click(image, { clientX: 50, clientY: 300 });

    expect(onSelect).toHaveBeenCalledWith({ x: 75, y: 75 });
  });

  test('rotates right on mobile landscape', async () => {
    mockMatchMedia(true);

    render(<InteractiveCourtImage selectedPoint={null} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('interactive-court-image')).toHaveStyle({
        transform: 'translate(-50%, -50%) rotate(90deg)',
      });
    });
  });
});
