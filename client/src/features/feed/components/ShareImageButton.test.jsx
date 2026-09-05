import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const shareImage = vi.fn();
const createImageFile = vi.fn();

vi.mock('../hooks/useShareImage', () => ({
  useShareImage: () => ({ createImageFile, shareImage, status: shareStatus }),
}));

// Stub the export so the test doesn't depend on card internals.
vi.mock('./cards/ShareableCardExport', () => ({
  ShareableCardExport: () => <div data-testid="export" />,
}));

let shareStatus = 'idle';

import { ShareImageButton } from './ShareImageButton';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

  it('hides the Instagram action when no handler is supplied', () => {
    shareStatus = 'idle';
    render(<ShareImageButton type="game_card" gameCard={{ teamName: 'X' }} />);
    expect(screen.queryByRole('button', { name: /prepare for instagram/i })).toBeNull();
  });

  it('hands the rendered file to onPrepareInstagram instead of downloading it', async () => {
    shareStatus = 'idle';
    const file = new File(['png'], 'x-tsw.png', { type: 'image/png' });
    createImageFile.mockResolvedValue(file);
    const onPrepareInstagram = vi.fn();

    render(
      <ShareImageButton
        type="game_card"
        gameCard={{ teamName: 'X' }}
        onPrepareInstagram={onPrepareInstagram}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /prepare for instagram/i }));

    await waitFor(() => expect(onPrepareInstagram).toHaveBeenCalledWith(file));
    expect(shareImage).not.toHaveBeenCalled();
  });

  it('does not hand over anything when rendering the image failed', async () => {
    shareStatus = 'idle';
    createImageFile.mockResolvedValue(null);
    const onPrepareInstagram = vi.fn();

    render(
      <ShareImageButton
        type="game_card"
        gameCard={{ teamName: 'X' }}
        onPrepareInstagram={onPrepareInstagram}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /prepare for instagram/i }));

    await waitFor(() => expect(createImageFile).toHaveBeenCalledTimes(1));
    expect(onPrepareInstagram).not.toHaveBeenCalled();
  });

  it('omits the share action where the surface never carried one', () => {
    shareStatus = 'idle';
    render(
      <ShareImageButton
        type="game_card"
        gameCard={{ teamName: 'X' }}
        showShare={false}
        onPrepareInstagram={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /share as image/i })).toBeNull();
    expect(screen.getByRole('button', { name: /prepare for instagram/i })).toBeInTheDocument();
  });
});
