import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob } from './downloadFile';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('downloadBlob', () => {
  it('creates an object URL, clicks an anchor, and revokes the URL', () => {
    const click = vi.fn();
    const anchor = { click, remove: vi.fn(), href: '', download: '' };
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:abc');
    globalThis.URL.revokeObjectURL = vi.fn();

    downloadBlob(new Blob(['x']), 'stats.csv');

    expect(anchor.download).toBe('stats.csv');
    expect(anchor.href).toBe('blob:abc');
    expect(click).toHaveBeenCalledTimes(1);
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:abc');
  });
});
