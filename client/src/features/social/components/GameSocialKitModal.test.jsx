import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted: vi.mock factories run before module-level consts are initialised.
const mocks = vi.hoisted(() => ({ createImageFile: vi.fn(), trackEvent: vi.fn() }));
const { createImageFile, trackEvent } = mocks;

vi.mock('../../feed/hooks/useShareImage', () => ({
  useShareImage: () => ({
    createImageFile: mocks.createImageFile,
    shareImage: vi.fn(),
    status: 'idle',
  }),
}));

vi.mock('../../analytics/trackEvent', () => ({ trackEvent: mocks.trackEvent }));

// Stub the exporter so the test does not depend on card internals or on
// html2canvas having a laid-out node.
vi.mock('../../feed/components/cards/ShareableCardExport', () => ({
  ShareableCardExport: forwardRef(function MockExport({ format }, ref) {
    return <div ref={ref} data-testid="export-node" data-format={format} />;
  }),
  ShareableCardPreview: ({ format }) => <div data-testid="preview" data-format={format} />,
}));

import { GameSocialKitModal } from './GameSocialKitModal';

// Social backlog rank 9: no permission block means no export, so every test
// that downloads has to say what the league agreed to.
const GRANTED = {
  canFeature: true,
  reason: 'granted',
  scope: 'league',
  orgName: 'Southside Hoops',
  restrictedPlayerIds: [],
  handles: {},
};

const ORIGIN = 'https://thesportyway.com';

const data = {
  game: {
    id: 'g1',
    status: 'completed',
    trackingMode: 'one_sided',
    opponent: 'Falcons',
    completedAt: '2026-09-12T20:45:00.000Z',
  },
  team: {
    id: 't1',
    name: 'TSW Blue',
    colors: [],
    players: [{ id: 'p1', jerseyNumber: 7 }],
  },
  boxScore: {
    players: [
      {
        playerId: 'p1',
        displayName: 'Jordan Blake',
        points: 28,
        reb: 9,
        ast: 6,
        fg2m: 5,
        fg2a: 9,
        fg3m: 4,
        fg3a: 7,
      },
    ],
    teamTotals: { points: 70 },
  },
  gameSummary: { teamPoints: 70, opponentPoints: 61, hasOpponentScore: true },
  recap: {
    statusLabel: 'Final',
    playedAt: '2026-09-12T20:45:00.000Z',
    team: { name: 'TSW Blue', points: 70 },
    opponent: { name: 'Falcons', points: 61 },
    teamStats: {
      points: 70,
      fg2: { percentage: 48 },
      fg3: { percentage: 31 },
      ft: { percentage: 71 },
      reb: 34,
      ast: 18,
    },
    topPerformers: [{ playerId: 'p1', displayName: 'Jordan Blake', points: 28, reb: 9, ast: 6 }],
  },
};

function pngFile(name) {
  const file = new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'image/png' });
  // jsdom's File has no arrayBuffer() in this environment.
  file.arrayBuffer = () => Promise.resolve(new Uint8Array([1, 2, 3, 4]).buffer);
  return file;
}

let lastDownload;

beforeEach(() => {
  vi.clearAllMocks();
  lastDownload = null;
  createImageFile.mockImplementation((node, fileName) => Promise.resolve(pngFile(fileName)));
  URL.createObjectURL = vi.fn(() => 'blob:kit');
  URL.revokeObjectURL = vi.fn();
  // Downloads are an anchor click; capture it rather than letting jsdom warn
  // about unimplemented navigation.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function capture() {
    lastDownload = this.download;
  });
});

afterEach(cleanup);

function renderModal(props = {}) {
  return render(
    <GameSocialKitModal
      open
      onClose={() => {}}
      data={data}
      origin={ORIGIN}
      marketing={GRANTED}
      {...props}
    />
  );
}

describe('GameSocialKitModal', () => {
  it('lists the numbered slides, the extras, and their file names', () => {
    renderModal();

    expect(screen.getByText('1. Result slide')).toBeVisible();
    expect(screen.getByText('2. Team totals slide')).toBeVisible();
    expect(screen.getByText('3. Top performers slide')).toBeVisible();
    expect(screen.getByText('4. Call to action slide')).toBeVisible();
    // Not numbered: these are not part of the carousel.
    expect(screen.getByText('Player card — Jordan Blake')).toBeVisible();
    expect(screen.getByText('Final score (9:16 Story)')).toBeVisible();
    expect(screen.getByText('01-tsw-blue-vs-falcons-2026-09-12-slide-result.png')).toBeVisible();
  });

  it('renumbers the files when a slide is moved', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Move Top performers slide earlier' }));

    expect(screen.getByText('2. Top performers slide')).toBeVisible();
    expect(screen.getByText('3. Team totals slide')).toBeVisible();
    expect(
      screen.getByText('02-tsw-blue-vs-falcons-2026-09-12-slide-performers.png')
    ).toBeVisible();
  });

  it('removes a slide and closes the gap in the numbering', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Team totals slide' }));

    expect(screen.queryByText(/Team totals slide/)).not.toBeInTheDocument();
    expect(screen.getByText('2. Top performers slide')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Restore every slide' })).toBeVisible();
  });

  it('cannot move the first slide earlier or the last later', () => {
    renderModal();

    expect(screen.getByRole('button', { name: 'Move Result slide earlier' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Call to action slide later' })).toBeDisabled();
  });

  it('renders nothing for a game that has not finished', () => {
    const { container } = render(
      <GameSocialKitModal
        open
        onClose={() => {}}
        data={{ ...data, game: { ...data.game, status: 'in_progress' } }}
        origin={ORIGIN}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('downloads one asset under its own file name', async () => {
    renderModal();

    fireEvent.click(screen.getAllByRole('button', { name: 'Download PNG' })[0]);

    await waitFor(() =>
      expect(lastDownload).toBe('01-tsw-blue-vs-falcons-2026-09-12-slide-result.png')
    );
    expect(trackEvent).toHaveBeenCalledWith('share_initiated', {
      target_type: 'carousel_slide',
      method: 'download',
      source: 'game_detail',
      format: 'post',
    });
    expect(trackEvent).toHaveBeenCalledWith(
      'share_completed',
      expect.objectContaining({ result: 'succeeded', target_type: 'carousel_slide' })
    );
  });

  it('packs every included asset plus the copy into one ZIP', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Download kit as ZIP \(6 images/ }));

    await waitFor(() => expect(lastDownload).toBe('tsw-blue-vs-falcons-2026-09-12-social-kit.zip'));
    expect(createImageFile).toHaveBeenCalledTimes(6);

    const blob = URL.createObjectURL.mock.calls.at(-1)[0];
    expect(blob.type).toBe('application/zip');
    // One event for the kit, not one per image — otherwise a kit download
    // inflates the per-card numbers beside it.
    expect(trackEvent).toHaveBeenCalledWith(
      'share_completed',
      expect.objectContaining({ target_type: 'game_kit', result: 'succeeded' })
    );
    expect(trackEvent.mock.calls.filter(([event]) => event === 'share_completed')).toHaveLength(1);
  });

  it('leaves a deselected asset out of the ZIP', async () => {
    renderModal();

    fireEvent.click(screen.getByRole('checkbox', { name: /Include Final score \(9:16 Story\)/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Include Player card — Jordan Blake/ }));
    fireEvent.click(screen.getByRole('button', { name: /Download kit as ZIP \(4 images/ }));

    await waitFor(() => expect(createImageFile).toHaveBeenCalledTimes(4));
    expect(createImageFile.mock.calls.map(([, name]) => name)).toEqual([
      '01-tsw-blue-vs-falcons-2026-09-12-slide-result.png',
      '02-tsw-blue-vs-falcons-2026-09-12-slide-comparison.png',
      '03-tsw-blue-vs-falcons-2026-09-12-slide-performers.png',
      '04-tsw-blue-vs-falcons-2026-09-12-slide-cta.png',
    ]);
  });

  it('reports a failed render instead of producing a half-empty ZIP', async () => {
    createImageFile.mockResolvedValueOnce(pngFile('ok.png')).mockResolvedValueOnce(null);
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /Download kit as ZIP/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not build the kit/);
    expect(lastDownload).toBeNull();
  });

  it('retags the link when the destination changes', () => {
    renderModal();

    fireEvent.change(screen.getByRole('combobox', { name: /posting destination/i }), {
      target: { value: 'tiktok' },
    });

    expect(screen.getByLabelText('Generated caption').value).toContain('utm_source=tiktok');
  });
});
