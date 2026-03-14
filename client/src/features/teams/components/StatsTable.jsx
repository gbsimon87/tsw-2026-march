import { useState } from 'react';

function getCellAlignment(align) {
  return align === 'right' ? 'text-right' : 'text-left';
}

function getStickyColumnClasses(index, type) {
  if (index !== 0) {
    return '';
  }

  if (type === 'header') {
    return 'sticky left-0 z-20 bg-slate-100 shadow-[1px_0_0_0_rgb(226_232_240)]';
  }

  return 'sticky left-0 z-10 bg-white shadow-[1px_0_0_0_rgb(226_232_240)]';
}

function getSortAccessor(column) {
  if (column.sortable === false) {
    return null;
  }

  if (typeof column.sortValue === 'function') {
    return column.sortValue;
  }

  if (column.sortKey) {
    return (row) => row[column.sortKey];
  }

  return (row) => row[column.id];
}

function normalizeSortValue(value) {
  if (value === null || value === undefined) {
    return { kind: 'empty', value: null };
  }

  if (typeof value === 'boolean') {
    return { kind: 'number', value: value ? 1 : 0 };
  }

  if (typeof value === 'number') {
    return { kind: 'number', value };
  }

  return { kind: 'string', value: String(value) };
}

function sortRows(rows, columns, sortConfig) {
  if (!sortConfig) {
    return rows;
  }

  const column = columns.find((candidate) => candidate.id === sortConfig.columnId);
  const sortAccessor = column ? getSortAccessor(column) : null;

  if (!column || !sortAccessor) {
    return rows;
  }

  const directionMultiplier = sortConfig.direction === 'asc' ? 1 : -1;

  return [...rows].sort((rowA, rowB) => {
    const valueA = normalizeSortValue(sortAccessor(rowA));
    const valueB = normalizeSortValue(sortAccessor(rowB));

    if (valueA.kind === 'empty' && valueB.kind === 'empty') {
      return 0;
    }
    if (valueA.kind === 'empty') {
      return 1;
    }
    if (valueB.kind === 'empty') {
      return -1;
    }

    if (valueA.kind === 'string' || valueB.kind === 'string') {
      return String(valueA.value).localeCompare(String(valueB.value)) * directionMultiplier;
    }

    if (valueA.value < valueB.value) {
      return -1 * directionMultiplier;
    }
    if (valueA.value > valueB.value) {
      return 1 * directionMultiplier;
    }
    return 0;
  });
}

export function StatsTable({ columns, rows, tableClassName = 'w-max text-sm' }) {
  const [sortConfig, setSortConfig] = useState(null);
  const sortedRows = sortRows(rows, columns, sortConfig);

  function toggleSort(columnId) {
    setSortConfig((current) => {
      if (!current || current.columnId !== columnId) {
        return { columnId, direction: 'desc' };
      }

      return {
        columnId,
        direction: current.direction === 'desc' ? 'asc' : 'desc',
      };
    });
  }

  return (
    <table className={tableClassName}>
      <thead className="bg-slate-100 text-slate-600">
        <tr>
          {columns.map((column, index) => {
            const isSorted = sortConfig?.columnId === column.id;
            const isSortable = Boolean(getSortAccessor(column));
            const stickyClasses = getStickyColumnClasses(index, 'header');

            return (
              <th
                key={column.id}
                className={`whitespace-nowrap px-1 py-1 sm:px-1.5 sm:py-1.5 ${getCellAlignment(column.align)} ${stickyClasses}`}
              >
                {isSortable ? (
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 font-medium transition hover:text-slate-900 ${
                      column.align === 'right' ? 'ml-auto' : ''
                    }`}
                    onClick={() => toggleSort(column.id)}
                  >
                    <span>{column.label}</span>
                    <span aria-hidden="true" className="text-xs text-slate-400">
                      {isSorted ? (sortConfig.direction === 'desc' ? '▼' : '▲') : '↕'}
                    </span>
                  </button>
                ) : (
                  column.label
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((row) => (
          <tr key={row.playerId || row.id} className="border-t border-slate-200">
            {columns.map((column, index) => (
              <td
                key={column.id}
                className={`whitespace-nowrap px-1 py-1 sm:px-1.5 sm:py-1.5 ${
                  column.emphasis ? 'font-semibold text-slate-900' : 'text-slate-700'
                } ${getCellAlignment(column.align)} ${getStickyColumnClasses(index, 'cell')}`}
              >
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
