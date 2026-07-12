import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useShareImage } from './useShareImage';

const toBlob = (cb) => cb(new Blob(['x'], { type: 'image/png' }));

vi.mock('html2canvas', () => ({
  default: vi.fn(async () => ({ toBlob })),
}));

import html2canvas from 'html2canvas';

function makeNode() {
  return document.createElement('div');
}

describe('useShareImage', () => {
  beforeEach(() => {
    html2canvas.mockClear();
  });

  afterEach(() => {
    delete navigator.share;
    delete navigator.canShare;
    vi.restoreAllMocks();
  });

  it('shares a PNG file via navigator.share when supported', async () => {
    navigator.canShare = vi.fn(() => true);
    navigator.share = vi.fn(async () => {});

    const { result } = renderHook(() => useShareImage());
    await act(async () => {
      await result.current.shareImage(makeNode(), 'card.png');
    });

    expect(navigator.share).toHaveBeenCalledTimes(1);
    const arg = navigator.share.mock.calls[0][0];
    expect(arg.files[0]).toBeInstanceOf(File);
    expect(arg.files[0].type).toBe('image/png');
    expect(result.current.status).toBe('success');
  });

  it('falls back to download when share is unsupported', async () => {
    const click = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = Object.assign(document.createElementNS('http://www.w3.org/1999/xhtml', tag), {});
      if (tag === 'a') el.click = click;
      return el;
    });
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();

    const { result } = renderHook(() => useShareImage());
    await act(async () => {
      await result.current.shareImage(makeNode(), 'card.png');
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('success');
  });

  it('returns to idle when the user cancels the share (AbortError)', async () => {
    navigator.canShare = vi.fn(() => true);
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    navigator.share = vi.fn(async () => {
      throw abort;
    });

    const { result } = renderHook(() => useShareImage());
    await act(async () => {
      await result.current.shareImage(makeNode(), 'card.png');
    });

    expect(result.current.status).toBe('idle');
  });

  it('sets error status when capture throws', async () => {
    html2canvas.mockRejectedValueOnce(new Error('tainted'));

    const { result } = renderHook(() => useShareImage());
    await act(async () => {
      await result.current.shareImage(makeNode(), 'card.png');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
