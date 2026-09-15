import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HighlightReceiptModal } from './HighlightReceiptModal';
import { renderHighlightReceipt } from '../renderHighlightReceipt';

vi.mock('../renderHighlightReceipt', () => ({ renderHighlightReceipt: vi.fn() }));

const data = {
  game: { id: 'g1', status: 'completed', trackingMode: 'one_sided' },
  gameSummary: { hasOpponentScore: true },
  boxScore: {
    players: [{ playerId: 'p1', displayName: 'Jordan Blake', points: 28, reb: 9, ast: 6 }],
  },
  recap: { team: { name: 'Blue', points: 70 }, opponent: { name: 'Falcons', points: 61 } },
  highlights: [
    {
      eventId: 'e1',
      playerId: 'p1',
      playerName: 'Jordan Blake',
      statType: 'FG3_MADE',
      videoTimestamp: 30,
    },
  ],
};
const marketing = { canFeature: true, scope: 'league', restrictedPlayerIds: [] };

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', { isTypeSupported: (type) => type === 'video/mp4' });
  HTMLCanvasElement.prototype.captureStream = vi.fn();
  URL.createObjectURL = vi.fn(() => 'blob:receipt');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  renderHighlightReceipt.mockResolvedValue({ blob: new Blob(['video']), extension: 'mp4' });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('HighlightReceiptModal', () => {
  test('blocks a restricted player before accepting a source video', () => {
    render(
      <HighlightReceiptModal
        open
        onClose={() => {}}
        data={data}
        marketing={{ ...marketing, restrictedPlayerIds: ['p1'] }}
      />
    );
    expect(screen.getByText(/No timestamped, cleared player plays/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download vertical clip' })).toBeDisabled();
  });

  test('requires a local source and credit, then downloads the selected receipt', async () => {
    render(<HighlightReceiptModal open onClose={() => {}} data={data} marketing={marketing} />);
    expect(screen.getByRole('button', { name: 'Download vertical clip' })).toBeDisabled();

    const file = new File(['video'], 'game.mp4', { type: 'video/mp4' });
    fireEvent.change(screen.getByLabelText('Source video file'), { target: { files: [file] } });
    await waitFor(() => expect(document.querySelector('video')).not.toBeNull());
    const video = document.querySelector('video');
    Object.defineProperty(video, 'duration', { configurable: true, value: 60 });
    fireEvent.loadedMetadata(video);
    fireEvent.change(screen.getByLabelText('Source-video credit'), {
      target: { value: 'Harbor Club' },
    });
    expect(screen.getByText('28 PTS · 9 REB · 6 AST')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download vertical clip' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /everyone identifiable in this clip/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Download vertical clip' }));
    await waitFor(() =>
      expect(renderHighlightReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: expect.objectContaining({ sourceCredit: 'Harbor Club', startSeconds: 26.5 }),
        })
      )
    );
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });
});
