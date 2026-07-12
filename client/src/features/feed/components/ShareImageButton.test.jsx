import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const shareImage = vi.fn();

vi.mock('../hooks/useShareImage', () => ({
  useShareImage: () => ({ shareImage, status: shareStatus }),
}));

// Stub the export so the test doesn't depend on card internals.
vi.mock('./cards/ShareableCardExport', () => ({
  ShareableCardExport: () => <div data-testid="export" />,
}));

let shareStatus = 'idle';

import { ShareImageButton } from './ShareImageButton';

afterEach(() => {
  cleanup();
});

describe('ShareImageButton', () => {
  it('invokes shareImage on click', () => {
    shareStatus = 'idle';
    render(<ShareImageButton type="player_card" playerCard={{ playerName: 'X' }} />);
    fireEvent.click(screen.getByRole('button', { name: /share as image/i }));
    expect(shareImage).toHaveBeenCalledTimes(1);
  });

  it('is disabled while generating', () => {
    shareStatus = 'generating';
    render(<ShareImageButton type="player_card" playerCard={{ playerName: 'X' }} />);
    expect(screen.getByRole('button', { name: /share as image/i })).toBeDisabled();
  });

  it('shows an error message on error', () => {
    shareStatus = 'error';
    render(<ShareImageButton type="player_card" playerCard={{ playerName: 'X' }} />);
    expect(screen.getByText(/couldn't create image/i)).toBeInTheDocument();
  });
});
