import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const shareImage = vi.fn();
const createImageFile = vi.fn();

vi.mock('../hooks/useShareImage', () => ({
  useShareImage: () => ({ createImageFile, shareImage, status: shareStatus }),
}));

// Stub the export so the test doesn't depend on card internals.
vi.mock('./cards/ShareableCardExport', () => ({
  ShareableCardExport: forwardRef(function MockShareableCardExport({ format }, ref) {
    return <div ref={ref} data-testid="export" data-format={format} />;
  }),
  ShareableCardPreview: ({ format }) => <div data-testid="preview" data-format={format} />,
}));

let shareStatus = 'idle';

import { ShareImageButton } from './ShareImageButton';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ShareImageButton', () => {
  it.each([
    ['post', 'x-tsw.png'],
    ['story', 'x-tsw-story.png'],
    ['link', 'x-tsw-link.png'],
  ])('opens a format chooser and shares the %s PNG', (format, fileName) => {
    shareStatus = 'idle';
    render(<ShareImageButton type="player_card" playerCard={{ playerName: 'X' }} />);
    fireEvent.click(screen.getByRole('button', { name: /share as image/i }));
    expect(screen.getByRole('dialog', { name: /share an image/i })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: /image format/i }), {
      target: { value: format },
    });
    expect(screen.getByTestId('preview')).toHaveAttribute('data-format', format);
    fireEvent.click(screen.getByRole('button', { name: /share or download png/i }));
    expect(shareImage).toHaveBeenCalledTimes(1);
    expect(shareImage.mock.calls[0][1]).toBe(fileName);
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
    expect(screen.getAllByTestId('export').map((node) => node.dataset.format)).toEqual(['post']);
  });

  it('keeps the Instagram handoff at 4:5 when another export format is selected', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: /share as image/i }));
    fireEvent.change(screen.getByRole('combobox', { name: /image format/i }), {
      target: { value: 'story' },
    });
    expect(screen.getAllByTestId('export').map((node) => node.dataset.format)).toEqual([
      'story',
      'post',
    ]);
    fireEvent.click(screen.getByRole('dialog').querySelector('button[aria-label="Close dialog"]'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /prepare for instagram/i }));

    await waitFor(() => expect(onPrepareInstagram).toHaveBeenCalledWith(file));
    expect(createImageFile.mock.calls[0][0]).toHaveAttribute('data-format', 'post');
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

// Social backlog rank 2: the box score drives one page-level instance from a
// selected row, rather than mounting a 1080x1350 export node per player.
describe('ShareImageButton — controlled mode', () => {
  it('renders no trigger of its own when the caller controls it', () => {
    shareStatus = 'idle';
    render(
      <ShareImageButton
        type="player_game_card"
        playerGameCard={{ playerName: 'X' }}
        open={false}
        onOpenChange={() => {}}
      />
    );

    expect(screen.queryByRole('button', { name: /share as image/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the chooser when the caller opens it', () => {
    shareStatus = 'idle';
    render(
      <ShareImageButton
        type="player_game_card"
        playerGameCard={{ playerName: 'X' }}
        open
        onOpenChange={() => {}}
      />
    );

    expect(screen.getByRole('dialog', { name: /share an image/i })).toBeInTheDocument();
  });

  it('tells the caller when the chooser is dismissed', () => {
    shareStatus = 'idle';
    const onOpenChange = vi.fn();
    render(
      <ShareImageButton
        type="player_game_card"
        playerGameCard={{ playerName: 'X' }}
        open
        onOpenChange={onOpenChange}
      />
    );

    // The modal renders both a backdrop and an in-header dismiss; either is a
    // dismissal as far as the caller is concerned.
    fireEvent.click(screen.getAllByRole('button', { name: /close dialog/i })[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('names the download after the player', () => {
    shareStatus = 'idle';
    render(
      <ShareImageButton
        type="player_game_card"
        playerGameCard={{ playerName: 'Jordan Miles' }}
        open
        onOpenChange={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /share or download png/i }));
    expect(shareImage).toHaveBeenCalledWith(expect.anything(), 'jordan-miles-tsw.png');
  });
});
