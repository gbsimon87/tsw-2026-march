import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { YouTubeHighlightReel } from './YouTubeHighlightReel';

const VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

function makeHighlights() {
  return [
    {
      eventId: 'first',
      statType: 'FG2_MADE',
      videoTimestamp: 20,
      videoUrl: VIDEO_URL,
      playerName: 'Alex',
    },
    {
      eventId: 'second',
      statType: 'BLK',
      videoTimestamp: 60,
      videoUrl: VIDEO_URL,
      playerName: 'Jordan',
    },
  ];
}

describe('YouTubeHighlightReel', () => {
  test('renders the first segment and supports manual navigation', () => {
    render(<YouTubeHighlightReel highlights={makeHighlights()} title="Final" />);

    expect(screen.getByText('Highlight 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByTitle('Final — highlight 1')).toHaveAttribute(
      'src',
      expect.stringContaining('start=15&end=25')
    );
    expect(screen.getByTitle('Final — highlight 1')).toHaveAttribute(
      'src',
      expect.stringContaining('controls=0')
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Highlight 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Jordan')).toBeInTheDocument();
    expect(screen.getByTitle('Final — highlight 2')).toHaveAttribute(
      'src',
      expect.stringContaining('start=55&end=65')
    );

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByText('Highlight 1 of 2')).toBeInTheDocument();
  });

  test('advances when the YouTube player reports that a segment ended', async () => {
    render(<YouTubeHighlightReel highlights={makeHighlights()} title="Final" />);

    const iframe = screen.getByTitle('Final — highlight 1');
    const playerWindow = iframe.contentWindow;
    const postMessageSpy = vi.spyOn(playerWindow, 'postMessage');
    fireEvent.load(iframe);
    expect(postMessageSpy).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }),
      '*'
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        source: playerWindow,
        data: JSON.stringify({ event: 'onStateChange', info: 0 }),
      })
    );

    await waitFor(() => expect(screen.getByText('Highlight 2 of 2')).toBeInTheDocument());
  });

  test('provides custom volume and maximise controls', () => {
    render(<YouTubeHighlightReel highlights={makeHighlights()} title="Final" />);

    const iframe = screen.getByTitle('Final — highlight 1');
    expect(screen.getByTestId('highlight-reel-player')).toHaveClass(
      'aspect-[4/3]',
      'sm:aspect-video'
    );
    expect(iframe).toHaveClass('w-[133.333%]', 'sm:w-full');
    const postMessageSpy = vi.spyOn(iframe.contentWindow, 'postMessage');
    fireEvent.change(screen.getByRole('slider', { name: 'Highlight reel volume' }), {
      target: { value: '35' },
    });

    expect(postMessageSpy).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'setVolume', args: [35] }),
      '*'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mute highlight reel' }));
    expect(postMessageSpy).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'mute', args: [] }),
      '*'
    );
    expect(screen.getByRole('button', { name: 'Unmute highlight reel' })).toBeInTheDocument();

    const player = screen.getByTestId('highlight-reel-player');
    player.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Maximise highlight reel' }));
    expect(player.requestFullscreen).toHaveBeenCalledTimes(1);
  });

  test('shows an empty state when no playable YouTube moments exist', () => {
    render(
      <YouTubeHighlightReel
        highlights={[
          {
            eventId: 'bad',
            statType: 'FG2_MADE',
            videoTimestamp: 20,
            videoUrl: 'https://example.com/video.mp4',
          },
        ]}
      />
    );

    expect(screen.getByText(/No playable YouTube highlights/i)).toBeInTheDocument();
    expect(screen.queryByTitle(/highlight 1/i)).not.toBeInTheDocument();
  });
});
