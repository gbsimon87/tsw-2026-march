import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const exportCsv = vi.fn();
let hookState = { exportCsv, isExporting: false, error: '' };

vi.mock('../hooks/useExportCsv', () => ({
  useExportCsv: () => hookState,
}));

import { ExportCsvButton } from './ExportCsvButton';

afterEach(() => {
  cleanup();
  exportCsv.mockClear();
  hookState = { exportCsv, isExporting: false, error: '' };
});

describe('ExportCsvButton', () => {
  it('single-action button calls exportCsv with no argument', () => {
    render(<ExportCsvButton fetcher={vi.fn()} label="Export my stats" />);
    fireEvent.click(screen.getByRole('button', { name: /export my stats/i }));
    expect(exportCsv).toHaveBeenCalledTimes(1);
    expect(exportCsv).toHaveBeenCalledWith();
  });

  it('shows a spinning/disabled state while exporting', () => {
    hookState = { exportCsv, isExporting: true, error: '' };
    render(<ExportCsvButton fetcher={vi.fn()} label="Export" />);
    const button = screen.getByRole('button', { name: /exporting/i });
    expect(button).toBeDisabled();
  });

  it('dataset menu passes the chosen dataset value to exportCsv', () => {
    render(
      <ExportCsvButton
        fetcher={vi.fn()}
        label="Export CSV"
        datasets={[
          { value: 'all', label: 'Everything' },
          { value: 'standings', label: 'Standings' },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /export csv/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Standings' }));
    expect(exportCsv).toHaveBeenCalledWith('standings');
  });

  it('renders an error message', () => {
    hookState = { exportCsv, isExporting: false, error: 'Export failed' };
    render(<ExportCsvButton fetcher={vi.fn()} label="Export" />);
    expect(screen.getByText('Export failed')).toBeInTheDocument();
  });
});
