import { describe, expect, test, vi } from 'vitest';
import {
  buildHighlightReceiptPlan,
  eligibleReceiptHighlights,
  receiptRecordingType,
} from './highlightReceipt';
import { drawReceiptFrame, renderHighlightReceipt, RECEIPT_SIZE } from './renderHighlightReceipt';

const data = {
  game: { id: 'g1', status: 'completed', trackingMode: 'one_sided' },
  gameSummary: { hasOpponentScore: true },
  boxScore: {
    players: [{ playerId: 'p1', displayName: 'Jordan Blake', points: 28, reb: 9, ast: 6 }],
  },
  recap: {
    team: { name: 'Blue', points: 70 },
    opponent: { name: 'Falcons', points: 61 },
  },
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
const granted = { canFeature: true, restrictedPlayerIds: [] };

describe('highlight receipt', () => {
  test('only a cleared, completed, timestamped player play is eligible', () => {
    expect(eligibleReceiptHighlights(data, granted)).toHaveLength(1);
    expect(eligibleReceiptHighlights(data, null)).toEqual([]);
    expect(eligibleReceiptHighlights(data, { ...granted, restrictedPlayerIds: ['p1'] })).toEqual(
      []
    );
    expect(
      eligibleReceiptHighlights({ ...data, game: { status: 'in_progress' } }, granted)
    ).toEqual([]);
    expect(
      eligibleReceiptHighlights(
        { ...data, highlights: [{ ...data.highlights[0], videoTimestamp: null }] },
        granted
      )
    ).toEqual([]);
  });

  test('builds a ten-second vertical receipt from the verified line and final score', () => {
    const plan = buildHighlightReceiptPlan({
      data,
      marketing: granted,
      highlight: data.highlights[0],
      sourceDuration: 40,
      sourceCredit: 'Harbor Club',
    });
    expect(plan).toMatchObject({
      error: null,
      startSeconds: 26.5,
      durationSeconds: 10,
      playSeconds: 7,
      playerName: 'Jordan Blake',
      playLabel: '3-point make',
      statLine: '28 PTS · 9 REB · 6 AST',
      result: 'Blue 70–61 Falcons',
      sourceCredit: 'Harbor Club',
      gameUrl: '/games/g1',
    });
    expect(
      buildHighlightReceiptPlan({
        data,
        marketing: granted,
        highlight: data.highlights[0],
        sourceDuration: 40,
        sourceCredit: '',
      }).error
    ).toMatch(/credit/);
    expect(
      buildHighlightReceiptPlan({
        data,
        marketing: granted,
        highlight: data.highlights[0],
        sourceDuration: 20,
        sourceCredit: 'Club',
      }).error
    ).toMatch(/outside/);
    expect(
      buildHighlightReceiptPlan({
        data: { ...data, gameSummary: { hasOpponentScore: false } },
        marketing: granted,
        highlight: data.highlights[0],
        sourceDuration: 40,
        sourceCredit: 'Club',
      }).error
    ).toMatch(/opponent score was not tracked/i);
  });

  test('selects an actual recorder format before enabling export', () => {
    expect(receiptRecordingType({ isTypeSupported: (type) => type === 'video/mp4' })).toEqual({
      mimeType: 'video/mp4',
      extension: 'mp4',
    });
    expect(receiptRecordingType({ isTypeSupported: (type) => type === 'video/webm' })).toEqual({
      mimeType: 'video/webm',
      extension: 'webm',
    });
    expect(receiptRecordingType(null)).toBeNull();
  });

  test('burns player, stat, score, credit and end-card copy into the frames', () => {
    const plan = buildHighlightReceiptPlan({
      data,
      marketing: granted,
      highlight: data.highlights[0],
      sourceDuration: 40,
      sourceCredit: 'Harbor Club',
    });
    const ctx = {
      fillRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      measureText: (text) => ({ width: text.length * 10 }),
    };
    const video = { videoWidth: 1920, videoHeight: 1080 };
    drawReceiptFrame(ctx, video, plan, 4);
    expect(ctx.drawImage).toHaveBeenCalled();
    const playText = ctx.fillText.mock.calls.map(([text]) => text);
    expect(playText).toContain('Jordan Blake');
    expect(playText).toContain('28 PTS · 9 REB · 6 AST');
    expect(playText).toContain('Blue 70–61 Falcons');
    expect(playText).toContain('Video: Harbor Club');
    ctx.fillText.mockClear();
    drawReceiptFrame(ctx, video, plan, 9);
    expect(ctx.fillText.mock.calls.map(([text]) => text)).toContain('thesportyway.com/games/g1');
    expect(RECEIPT_SIZE.width / RECEIPT_SIZE.height).toBe(9 / 16);
  });

  test('records ten seconds, then releases the local media stream', async () => {
    vi.useFakeTimers();
    const performanceSpy = vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const priorCapture = HTMLCanvasElement.prototype.captureStream;
    const stopTrack = vi.fn();
    const stream = { getTracks: () => [{ stop: stopTrack }] };
    HTMLCanvasElement.prototype.captureStream = vi.fn(() => stream);
    const ctx = {
      scale: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      measureText: (text) => ({ width: text.length * 10 }),
    };
    const contextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    class FakeRecorder {
      static isTypeSupported(type) {
        return type === 'video/webm';
      }
      constructor() {
        this.state = 'inactive';
      }
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        this.ondataavailable({ data: new Blob(['frames']) });
        this.onstop();
      }
    }
    vi.stubGlobal('MediaRecorder', FakeRecorder);
    const video = {
      readyState: 1,
      currentTime: 26.5,
      videoWidth: 1920,
      videoHeight: 1080,
      pause: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
    };
    const plan = buildHighlightReceiptPlan({
      data,
      marketing: granted,
      highlight: data.highlights[0],
      sourceDuration: 40,
      sourceCredit: 'Harbor Club',
    });

    try {
      const recording = renderHighlightReceipt({ video, plan });
      await vi.advanceTimersByTimeAsync(10100);
      const result = await recording;
      expect(result.extension).toBe('webm');
      expect(result.blob.size).toBeGreaterThan(0);
      expect(video.play).toHaveBeenCalled();
      expect(video.pause).toHaveBeenCalled();
      expect(stopTrack).toHaveBeenCalledTimes(1);
      expect(ctx.scale).toHaveBeenCalledWith(2, 2);
    } finally {
      contextSpy.mockRestore();
      performanceSpy.mockRestore();
      HTMLCanvasElement.prototype.captureStream = priorCapture;
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
