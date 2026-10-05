import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MuxVideo } from './components/MuxVideo';
import { HighlightPlayer } from './components/HighlightPlayer';
import { MuxHighlightFeed } from './components/MuxHighlightFeed';
import { GameVideoUploader, MAX_VIDEO_UPLOAD_BYTES } from './components/GameVideoUploader';
import { useVideoPlayback } from './hooks/useVideoPlayback';
import { activatePlayback, releasePlayback } from './playbackCoordinator';
import { gameVideoSourceKey, hasPlayableVideo } from './videoSource';
import { buildHighlightReelSegments } from '../games/highlightReel';
import { YouTubeHighlightReel } from '../games/components/YouTubeHighlightReel';

const mocks = vi.hoisted(() => ({
  getPlayback: vi.fn(),
  createUpload: vi.fn(),
  cancelUpload: vi.fn(),
  remove: vi.fn(),
  getById: vi.fn(),
  upload: vi.fn(),
  playerProps: null,
}));
vi.mock('./api/videoApi', () => ({ videoApi: mocks }));
vi.mock('../games/api/gamesApi', () => ({ gamesApi: mocks }));
vi.mock('@mux/upchunk', () => ({ createUpload: mocks.upload }));
vi.mock('@mux/mux-player-react/lazy', async () => {
  const { forwardRef } = await import('react');
  return {
    default: forwardRef(function MockPlayer(props, ref) {
      mocks.playerProps = props;
      return (
        <video
          ref={ref}
          data-testid="mux-player"
          onPlay={props.onPlay}
          onPause={props.onPause}
          onEnded={props.onEnded}
          onError={props.onError}
          onLoadedMetadata={props.onLoadedMetadata}
          onCanPlay={props.onCanPlay}
        >
          <track kind="captions" />
        </video>
      );
    }),
  };
});
const ready = { provider: 'mux', status: 'ready', version: 1 };
const pending = { ...ready, status: 'uploading' };
const highlight = {
  gameId: 'game',
  eventId: 'event',
  videoProvider: 'mux',
  videoVersion: 1,
  videoTimestamp: 100,
  statType: 'FG2_MADE',
};
const grant = () => ({
  provider: 'mux',
  playbackId: 'private-id',
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  tokens: { playback: 'secret', thumbnail: 'thumb' },
});
let client;
let observer;
let handlers;
let upload;
function wrapper({ children }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function renderVideo(ui) {
  return render(ui, { wrapper });
}
function chooseFile(size = 100) {
  const file = new File(['video'], 'game.mp4', { type: 'video/mp4' });
  Object.defineProperty(file, 'size', { value: size });
  fireEvent.change(screen.getByLabelText('Choose game video'), { target: { files: [file] } });
  return file;
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.getPlayback.mockImplementation(() => Promise.resolve(grant()));
  mocks.createUpload.mockResolvedValue({
    attemptId: 'attempt',
    uploadUrl: 'https://upload.mux.com/bearer',
    video: pending,
  });
  mocks.cancelUpload.mockResolvedValue({});
  mocks.remove.mockResolvedValue({});
  mocks.getById.mockResolvedValue({ game: { video: pending }, videoUpload: { allowed: true } });
  handlers = {};
  upload = {
    on: vi.fn((name, fn) => {
      handlers[name] = fn;
    }),
    abort: vi.fn(),
  };
  mocks.upload.mockReturnValue(upload);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(fn) {
        observer = fn;
      }
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('signed playback', () => {
  test('fetches on playback intent and sends the event reference, not a browser clip window', async () => {
    renderVideo(<HighlightPlayer highlight={highlight} />);
    expect(mocks.getPlayback).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Play Game highlight' }));
    await screen.findByTestId('mux-player');
    expect(mocks.getPlayback).toHaveBeenCalledWith('game', 'event');
    expect(mocks.playerProps.tokens.playback).toBe('secret');
    expect(mocks.playerProps.storyboardSrc).toBe('');
    expect(sessionStorage.length).toBe(0);
  });
  test('offscreen Pulse clips request no credentials and pause when they leave view', async () => {
    renderVideo(<MuxHighlightFeed highlight={highlight} />);
    expect(mocks.getPlayback).not.toHaveBeenCalled();
    act(() => observer([{ isIntersecting: true, intersectionRatio: 0.2 }]));
    expect(mocks.getPlayback).not.toHaveBeenCalled();
    act(() => observer([{ isIntersecting: true, intersectionRatio: 0.8 }]));
    await screen.findByTestId('mux-player');
    const media = screen.getByTestId('mux-player');
    const pause = vi.spyOn(media, 'pause');
    act(() => observer([{ isIntersecting: false, intersectionRatio: 0 }]));
    expect(pause).toHaveBeenCalled();
  });
  test('preserves the observed clip time, pause, volume and mute across renewal', async () => {
    renderVideo(<MuxVideo gameId="game" eventId="event" autoPlay />);
    const media = await screen.findByTestId('mux-player');
    Object.defineProperty(media, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(media, 'paused', { configurable: true, value: true });
    media.currentTime = 102.7;
    media.volume = 0.4;
    media.muted = true;
    await act(async () => client.invalidateQueries({ queryKey: ['videoPlayback'] }));
    media.currentTime = 95;
    media.volume = 1;
    media.muted = false;
    fireEvent.loadedMetadata(media);
    expect(media.currentTime).toBe(102.7);
    expect(media.volume).toBe(0.4);
    expect(media.muted).toBe(true);
    expect(media.pause).toHaveBeenCalled();
  });
  test('source version and viewer changes fetch new credentials and discard old playback', async () => {
    const view = renderVideo(<MuxVideo gameId="game" version={1} autoPlay />);
    await screen.findByTestId('mux-player');
    view.rerender(<MuxVideo gameId="game" version={2} autoPlay />);
    await waitFor(() => expect(mocks.getPlayback).toHaveBeenCalledTimes(2));
    act(() => client.setQueryData(['auth', 'me'], { id: 'other-viewer' }));
    await waitFor(() => expect(mocks.getPlayback).toHaveBeenCalledTimes(3));
    expect(
      client.getQueryCache().findAll({ queryKey: ['videoPlayback', 'other-viewer'] })
    ).toHaveLength(1);
  });
  test('permission denial and out-of-range clips are unavailable without retries', async () => {
    mocks.getPlayback.mockRejectedValue(Object.assign(new Error('Denied'), { status: 422 }));
    renderVideo(<MuxVideo gameId="game" autoPlay />);
    expect(await screen.findByText('Video unavailable')).toBeInTheDocument();
    expect(mocks.getPlayback).toHaveBeenCalledTimes(1);
  });
  test('media errors refresh once, then show unavailable instead of looping', async () => {
    renderVideo(<MuxVideo gameId="game" autoPlay />);
    const media = await screen.findByTestId('mux-player');
    fireEvent.error(media);
    await waitFor(() => expect(mocks.getPlayback).toHaveBeenCalledTimes(2));
    fireEvent.error(media);
    expect(screen.getByText('Video unavailable')).toBeInTheDocument();
    expect(mocks.getPlayback).toHaveBeenCalledTimes(2);
  });
  // V2: every new token makes mux-video reload its source (rebuffer, and a
  // tracker clock that keeps running). Returning to a tab with a valid token
  // must not mint one.
  test('returning to the tab with a valid token does not refetch it', async () => {
    const hook = renderHook(() => useVideoPlayback({ gameId: 'game', enabled: true }), { wrapper });
    await waitFor(() => expect(hook.result.current.data).toBeDefined());
    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    focusManager.setFocused(undefined);
    expect(mocks.getPlayback).toHaveBeenCalledTimes(1);
  });
  test('a video the viewer paused stays paused after a token renewal', async () => {
    const view = renderVideo(<MuxVideo gameId="game" autoPlay />);
    const media = await screen.findByTestId('mux-player');
    Object.defineProperty(media, 'readyState', { configurable: true, value: 4 });
    Object.defineProperty(media, 'paused', { configurable: true, value: true });
    fireEvent.pause(media);
    await act(async () => client.invalidateQueries({ queryKey: ['videoPlayback'] }));
    await waitFor(() => expect(mocks.getPlayback).toHaveBeenCalledTimes(2));
    fireEvent.loadedMetadata(media);
    view.rerender(<MuxVideo gameId="game" autoPlay />);
    expect(mocks.playerProps.autoPlay).toBe(false);
  });
  test('renews ahead of expiry and on waking an expired tab', async () => {
    vi.useFakeTimers();
    const hook = renderHook(() => useVideoPlayback({ gameId: 'game', enabled: true }), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(hook.result.current.data).toBeDefined();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(55 * 60 * 1000);
    });
    expect(mocks.getPlayback).toHaveBeenCalledTimes(2);
    // An inactive tab can skip polling; a visibility event checks expiry itself.
    vi.setSystemTime(Date.now() + 3600000);
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(mocks.getPlayback).toHaveBeenCalledTimes(3);
  });
});

// V21: client edge cases from the Mux review.
describe('playback edge cases (V21)', () => {
  test('a device clock ahead of the server still plays and does not refetch every second', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Server says one hour; the device clock is two hours ahead of it.
    mocks.getPlayback.mockImplementation(() =>
      Promise.resolve({
        ...grant(),
        expiresAt: new Date(Date.now() - 3600000).toISOString(),
        expiresInSeconds: 3600,
      })
    );
    renderVideo(<MuxVideo gameId="game" autoPlay />);
    await screen.findByTestId('mux-player');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(mocks.getPlayback).toHaveBeenCalledTimes(1);
  });
  test('a recovered media error can refresh credentials again later', async () => {
    renderVideo(<MuxVideo gameId="game" autoPlay />);
    const media = await screen.findByTestId('mux-player');
    fireEvent.error(media);
    await waitFor(() => expect(mocks.getPlayback).toHaveBeenCalledTimes(2));
    fireEvent.canPlay(media);
    fireEvent.error(media);
    await waitFor(() => expect(mocks.getPlayback).toHaveBeenCalledTimes(3));
    expect(screen.queryByText('Video unavailable')).not.toBeInTheDocument();
  });
  test('an offscreen feed card shows no dead Play button', () => {
    renderVideo(<MuxHighlightFeed highlight={highlight} />);
    expect(screen.queryByRole('button', { name: /^Play/ })).not.toBeInTheDocument();
    expect(mocks.getPlayback).not.toHaveBeenCalled();
  });
});

describe('uploads', () => {
  test('transfers in chunks, displays progress, polls media fields, and stores only an attempt id', async () => {
    const change = vi.fn();
    render(
      <GameVideoUploader gameId="game" allowance={{ allowed: true }} onMediaChange={change} />
    );
    const file = chooseFile();
    await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
    expect(mocks.createUpload).toHaveBeenCalledWith('game', {
      sizeBytes: 100,
      mimeType: 'video/mp4',
      sameRecording: false,
    });
    expect(mocks.upload).toHaveBeenCalledWith({
      endpoint: 'https://upload.mux.com/bearer',
      file,
      chunkSize: 5120,
    });
    expect(sessionStorage.getItem('gameVideoAttempt:game')).toBe('attempt');
    act(() => handlers.progress({ detail: 51.2 }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '51');
    mocks.getById.mockResolvedValue({
      game: { video: ready, events: ['stale'], clock: { status: 'stale' } },
      videoUpload: { allowed: false },
    });
    act(() => handlers.success());
    await waitFor(() =>
      expect(change).toHaveBeenLastCalledWith({
        video: ready,
        videoProvider: undefined,
        videoUpload: { allowed: false },
      })
    );
  });
  test('cancel during creation compensates after the delayed upload id arrives', async () => {
    let resolve;
    mocks.createUpload.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    render(<GameVideoUploader gameId="game" allowance={{ allowed: true }} />);
    chooseFile();
    fireEvent.click(screen.getByText('Cancel upload'));
    await act(async () => resolve({ attemptId: 'late', uploadUrl: 'bearer', video: pending }));
    expect(mocks.cancelUpload).toHaveBeenCalledWith('game', 'late');
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });
  test('unmount aborts the transfer and cancels its reservation', async () => {
    const view = render(<GameVideoUploader gameId="game" allowance={{ allowed: true }} />);
    chooseFile();
    await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
    view.unmount();
    expect(upload.abort).toHaveBeenCalled();
    expect(mocks.cancelUpload).toHaveBeenCalledWith('game', 'attempt');
  });
  test('failed cancellation keeps recovery available until server confirmation', async () => {
    mocks.cancelUpload.mockRejectedValueOnce(new Error('network'));
    render(<GameVideoUploader gameId="game" allowance={{ allowed: true }} />);
    chooseFile();
    await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Cancel upload'));
    await screen.findByRole('alert');
    expect(sessionStorage.getItem('gameVideoAttempt:game')).toBe('attempt');
    fireEvent.click(screen.getByText('Cancel upload'));
    await waitFor(() => expect(sessionStorage.length).toBe(0));
  });
  // V21: losing replay entitlement hides `video` in the poll; that is not the
  // server discarding the upload, so the live transfer continues.
  test('a poll without video does not abort a live transfer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const change = vi.fn();
    render(
      <GameVideoUploader gameId="game" allowance={{ allowed: true }} onMediaChange={change} />
    );
    chooseFile();
    await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
    mocks.getById.mockResolvedValue({ game: { video: null }, videoUpload: { allowed: false } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(mocks.getById).toHaveBeenCalled();
    expect(upload.abort).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalledWith(expect.objectContaining({ video: null }));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
  test('cancelling while the create request fails still offers Cancel', async () => {
    let reject;
    mocks.createUpload.mockReturnValue(
      new Promise((_, r) => {
        reject = r;
      })
    );
    render(<GameVideoUploader gameId="game" allowance={{ allowed: true }} />);
    chooseFile();
    fireEvent.click(screen.getByText('Cancel upload'));
    await act(async () => reject(new Error('network')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try cancelling again');
    fireEvent.click(screen.getByText('Cancel upload'));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('game'));
  });
  test('a stale poll cannot resurrect a removed video', async () => {
    let resolve;
    mocks.getById.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    const change = vi.fn();
    render(<GameVideoUploader gameId="game" video={ready} onMediaChange={change} />);
    // Make a manual status check available via a remove error, then begin one.
    mocks.remove.mockRejectedValueOnce(new Error('try again'));
    fireEvent.click(screen.getByText('Remove video'));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByText('Refresh video status'));
    fireEvent.click(screen.getByText('Remove video'));
    await waitFor(() => expect(change).toHaveBeenCalledWith({ video: null }));
    await act(async () => resolve({ game: { video: ready } }));
    expect(change).toHaveBeenCalledTimes(1);
  });
  test('polls without overlapping requests and stops after ten minutes', async () => {
    vi.useFakeTimers();
    let resolve;
    mocks.getById.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      })
    );
    render(<GameVideoUploader gameId="game" video={pending} />);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(mocks.getById).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(12000));
    expect(mocks.getById).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ game: { video: pending } }));
    await act(async () => vi.advanceTimersByTimeAsync(10 * 60 * 1000));
    const count = mocks.getById.mock.calls.length;
    expect(
      screen.getByText('Processing is taking longer. Refresh to check again.')
    ).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(mocks.getById).toHaveBeenCalledTimes(count);
  });
  // V3: a full-game transfer often outlasts the ten-minute processing poll;
  // the window must start when processing does.
  test('a transfer longer than ten minutes still polls through processing', async () => {
    vi.useFakeTimers();
    render(<GameVideoUploader gameId="game" allowance={{ allowed: true }} />);
    chooseFile();
    await act(async () => vi.advanceTimersByTimeAsync(10));
    expect(mocks.upload).toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(11 * 60 * 1000));
    expect(
      screen.queryByText('Processing is taking longer. Refresh to check again.')
    ).not.toBeInTheDocument();
    act(() => handlers.success());
    await act(async () => vi.advanceTimersByTimeAsync(10));
    const count = mocks.getById.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(9000));
    expect(mocks.getById.mock.calls.length).toBeGreaterThan(count);
  });
  test('confirmed equivalent recording is sent explicitly and duplicate selection creates only one upload', async () => {
    let resolve;
    mocks.createUpload.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    render(
      <GameVideoUploader
        gameId="game"
        videoUrl="https://youtu.be/dQw4w9WgXcQ"
        allowance={{ allowed: true }}
      />
    );
    fireEvent.click(screen.getByRole('checkbox'));
    const input = screen.getByLabelText('Choose game video');
    const file = new File(['x'], 'same.mp4', { type: 'video/mp4' });
    act(() => {
      fireEvent.change(input, { target: { files: [file] } });
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(mocks.createUpload).toHaveBeenCalledTimes(1);
    expect(mocks.createUpload.mock.calls[0][1].sameRecording).toBe(true);
    await act(async () => resolve({ attemptId: 'attempt', uploadUrl: 'bearer', video: pending }));
  });
  // The allowance reason decides the guidance; "not enabled for this game"
  // misled a League owner whose game was simply not started yet.
  test.each([
    ['not_league_manager', /Only the league owner or a league manager/],
    ['league_not_granted', /isn't enabled for this league/],
    ['not_league_game', /only for league games/],
    ['hosting_disabled', /switched off/],
  ])('a %s denial explains what to do', (reason, text) => {
    render(<GameVideoUploader gameId="game" allowance={{ allowed: false, reason }} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
  test('rejects oversized files before requesting a billable upload', () => {
    render(<GameVideoUploader gameId="game" allowance={{ allowed: true }} />);
    chooseFile(MAX_VIDEO_UPLOAD_BYTES + 1);
    expect(screen.getByRole('alert')).toHaveTextContent('up to 20 GB');
    expect(mocks.createUpload).not.toHaveBeenCalled();
  });
  test('ready and errored media can be removed without upload allowance', async () => {
    render(<GameVideoUploader gameId="game" video={ready} allowance={{ allowed: false }} />);
    fireEvent.click(screen.getByText('Remove video'));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('game'));
  });
});

test('mixed-provider coordination pauses the previous owner but does not release a newer owner', () => {
  const youtube = {};
  const mux = {};
  const pauseYT = vi.fn();
  const pauseMux = vi.fn();
  activatePlayback(youtube, pauseYT);
  activatePlayback(mux, pauseMux);
  releasePlayback(youtube);
  activatePlayback({}, vi.fn());
  expect(pauseYT).toHaveBeenCalledTimes(1);
  expect(pauseMux).toHaveBeenCalledTimes(1);
});
test('provider helpers prefer ready Mux and deduplicate only the same recording', () => {
  expect(hasPlayableVideo({ video: pending })).toBe(false);
  expect(hasPlayableVideo({ video: ready })).toBe(true);
  expect(gameVideoSourceKey({ id: 'game', video: ready })).toBe('mux:game:1');
  const segments = buildHighlightReelSegments([
    highlight,
    { ...highlight, eventId: 'duplicate', videoTimestamp: 101 },
    { ...highlight, gameId: 'another', eventId: 'other', videoTimestamp: 101 },
    { ...highlight, eventId: 'withdrawn', videoAvailable: false },
  ]);
  expect(segments.map((s) => s.eventId)).toEqual(['event', 'other']);
});
test('Mux reel uses ended to advance, retains volume, and offers replay', async () => {
  renderVideo(
    <YouTubeHighlightReel
      highlights={[highlight, { ...highlight, eventId: 'second', videoTimestamp: 150 }]}
    />
  );
  let media = await screen.findByTestId('mux-player');
  fireEvent.change(screen.getByLabelText('Highlight reel volume'), { target: { value: '30' } });
  fireEvent.ended(media);
  await waitFor(() => expect(mocks.getPlayback).toHaveBeenCalledWith('game', 'second'));
  media = await screen.findByTestId('mux-player');
  expect(mocks.playerProps.volume).toBe(0.3);
  fireEvent.ended(media);
  expect(await screen.findByText('Replay')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Replay'));
  expect(screen.getByText('Highlight 1 of 2')).toBeInTheDocument();
});

test('the reel clamps an index when highlights disappear and resets to the new source', async () => {
  const second = { ...highlight, eventId: 'second', videoTimestamp: 150 };
  const view = renderVideo(<YouTubeHighlightReel highlights={[highlight, second]} />);
  await screen.findByTestId('mux-player');
  fireEvent.click(screen.getByText('Next'));
  await waitFor(() => expect(mocks.getPlayback).toHaveBeenCalledWith('game', 'second'));
  view.rerender(<YouTubeHighlightReel highlights={[{ ...highlight, videoVersion: 2 }]} />);
  expect(await screen.findByText('Highlight 1 of 1')).toBeInTheDocument();
  expect(screen.getByText('Previous')).toBeDisabled();
});
