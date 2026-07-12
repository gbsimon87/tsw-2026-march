import { renderHook, act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const downloadBlob = vi.fn();
vi.mock('../../../lib/downloadFile', () => ({
  downloadBlob: (...args) => downloadBlob(...args),
}));

import { useExportCsv } from './useExportCsv';

afterEach(() => {
  vi.clearAllMocks();
});

describe('useExportCsv', () => {
  it('fetches then downloads the blob with its filename', async () => {
    const blob = new Blob(['a']);
    const fetcher = vi.fn(async () => ({ blob, filename: 'stats.csv' }));

    const { result } = renderHook(() => useExportCsv(fetcher));
    await act(async () => {
      await result.current.exportCsv('all');
    });

    expect(fetcher).toHaveBeenCalledWith('all');
    expect(downloadBlob).toHaveBeenCalledWith(blob, 'stats.csv');
    expect(result.current.isExporting).toBe(false);
    expect(result.current.error).toBe('');
  });

  it('surfaces an error message when the fetcher rejects', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('nope');
    });

    const { result } = renderHook(() => useExportCsv(fetcher));
    await act(async () => {
      await result.current.exportCsv();
    });

    await waitFor(() => expect(result.current.error).toBe('nope'));
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
