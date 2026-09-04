import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { InteractiveCourtImage } from './InteractiveCourtImage';
import { COURT_LAYOUTS } from '../court/courtLayouts';

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

function pointerDown(element, coordinates) {
  fireEvent(element, new MouseEvent('pointerdown', { bubbles: true, ...coordinates }));
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

    pointerDown(image, { clientX: 50, clientY: 300 });

    expect(onSelect).toHaveBeenCalledWith({ x: 25, y: 75 });
  });

  test('maps selected points when rotated right', () => {
    const onSelect = vi.fn();
    render(<InteractiveCourtImage selectedPoint={null} onSelect={onSelect} rotate90 />);

    const image = screen.getByTestId('interactive-court-image');
    setElementRect(image, { width: 200, height: 400 });

    pointerDown(image, { clientX: 50, clientY: 300 });

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

  test('renders the asset and intrinsic box of the layout it is given', () => {
    render(
      <InteractiveCourtImage
        selectedPoint={null}
        onSelect={vi.fn()}
        layout={COURT_LAYOUTS['court-v2']}
      />
    );

    const image = screen.getByAltText(/Basketball court/i);
    expect(image.getAttribute('src')).toContain('basketball_court_2');
    expect(image.getAttribute('width')).toBe(String(COURT_LAYOUTS['court-v2'].width));
    expect(image.getAttribute('height')).toBe(String(COURT_LAYOUTS['court-v2'].height));
  });

  test('defaults to the legacy asset when no layout is given', () => {
    render(<InteractiveCourtImage selectedPoint={null} onSelect={vi.fn()} />);

    const image = screen.getByAltText(/Basketball court/i);
    expect(image.getAttribute('src')).toContain('basketball_court_1');
    expect(image.getAttribute('width')).toBe('420');
    expect(image.getAttribute('height')).toBe('760');
  });

  // Coordinates are percentages of the rendered box, so the pointer mapping is
  // deliberately layout-independent - only the image behind it changes.
  test('normalizes coordinates identically across layouts, rotated and not', () => {
    for (const layout of Object.values(COURT_LAYOUTS)) {
      for (const rotate90 of [false, true]) {
        const onSelect = vi.fn();
        const { unmount } = render(
          <InteractiveCourtImage
            selectedPoint={null}
            onSelect={onSelect}
            layout={layout}
            rotate90={rotate90}
          />
        );

        const image = screen.getByTestId('interactive-court-image');
        setElementRect(image, { width: 200, height: 400 });
        pointerDown(image, { clientX: 50, clientY: 300 });

        expect(onSelect).toHaveBeenCalledWith(rotate90 ? { x: 75, y: 75 } : { x: 25, y: 75 });
        unmount();
      }
    }
  });
});
