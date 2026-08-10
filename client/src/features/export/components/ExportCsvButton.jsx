import { useState } from 'react';
import { useExportCsv } from '../hooks/useExportCsv';

const BASE_BUTTON =
  'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:border-[#F4A300]/60 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

function Spinner() {
  return (
    <span
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
      aria-hidden="true"
    />
  );
}

// A CSV export control. When `datasets` is provided it renders a dropdown menu
// (one item per dataset, passed through to the fetcher); otherwise a single
// button that calls the fetcher with no argument.
export function ExportCsvButton({
  fetcher,
  label = 'Export CSV',
  datasets = null,
  className = '',
}) {
  const { exportCsv, isExporting, error } = useExportCsv(fetcher);
  const [open, setOpen] = useState(false);

  if (!datasets) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={() => exportCsv()}
          disabled={isExporting}
          className={BASE_BUTTON}
        >
          {isExporting ? <Spinner /> : null}
          {isExporting ? 'Exporting…' : label}
        </button>
        {error ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={isExporting}
        aria-haspopup="menu"
        aria-expanded={open}
        className={BASE_BUTTON}
      >
        {isExporting ? <Spinner /> : null}
        {isExporting ? 'Exporting…' : label}
        <span aria-hidden="true">▾</span>
      </button>
      {open && !isExporting ? (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {datasets.map((dataset) => (
            <button
              key={dataset.value}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                exportCsv(dataset.value);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
            >
              {dataset.label}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
