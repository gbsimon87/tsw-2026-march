import { useState } from 'react';
import { downloadBlob } from '../../../lib/downloadFile';

// Imperative CSV export: calls a fetcher returning { blob, filename }, then
// triggers a browser download. Plain state (not TanStack Query) — a download is a
// one-shot user action, not cached server state, and this keeps the button usable
// on pages that aren't wrapped in a QueryClientProvider. `fetcher` is invoked with
// whatever `exportCsv` is called with (e.g. a dataset key).
export function useExportCsv(fetcher) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');

  async function exportCsv(args) {
    if (isExporting) {
      return;
    }
    setError('');
    setIsExporting(true);
    try {
      const { blob, filename } = await fetcher(args);
      downloadBlob(blob, filename);
    } catch (exportError) {
      setError(exportError?.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }

  return { exportCsv, isExporting, error };
}
