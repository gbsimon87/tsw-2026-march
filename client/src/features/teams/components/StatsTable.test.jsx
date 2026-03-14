import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { StatsTable } from './StatsTable';

describe('StatsTable', () => {
  test('sorts using explicit sortValue', () => {
    render(
      <StatsTable
        columns={[
          {
            id: 'name',
            label: 'Name',
            align: 'left',
            sortValue: (row) => row.rank,
            render: (row) => row.name,
          },
        ]}
        rows={[
          { id: 'b', name: 'Beta', rank: 1 },
          { id: 'a', name: 'Alpha', rank: 3 },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Name/i }));
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Alpha')).toBeInTheDocument();
  });

  test('sorts using sortKey', () => {
    cleanup();
    render(
      <StatsTable
        columns={[
          { id: 'name', label: 'Name', align: 'left', sortKey: 'name', render: (row) => row.name },
        ]}
        rows={[
          { id: 'b', name: 'Beta' },
          { id: 'a', name: 'Alpha' },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Name/i }));
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Beta')).toBeInTheDocument();
  });

  test('sorts by default when the column id exists on the row', () => {
    cleanup();
    render(
      <StatsTable
        columns={[{ id: 'points', label: 'PTS', align: 'right', render: (row) => row.points }]}
        rows={[
          { id: 'a', display: 'Alpha', points: 2 },
          { id: 'b', display: 'Beta', points: 8 },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /PTS/i }));
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('8')).toBeInTheDocument();
  });

  test('does not make a column sortable when explicitly disabled', () => {
    cleanup();
    render(
      <StatsTable
        columns={[
          {
            id: 'display',
            label: 'Display',
            align: 'left',
            sortable: false,
            render: (row) => row.name,
          },
        ]}
        rows={[{ id: 'a', name: 'Alpha' }]}
      />
    );

    expect(screen.queryByRole('button', { name: /Display/i })).not.toBeInTheDocument();
  });

  test('toggles descending then ascending', () => {
    cleanup();
    render(
      <StatsTable
        columns={[{ id: 'points', label: 'PTS', align: 'right', render: (row) => row.points }]}
        rows={[
          { id: 'a', display: 'Alpha', points: 2 },
          { id: 'b', display: 'Beta', points: 8 },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /PTS/i }));
    let rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('8')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /PTS/i }));
    rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('2')).toBeInTheDocument();
  });

  test('keeps initial order before interaction', () => {
    cleanup();
    render(
      <StatsTable
        columns={[
          { id: 'display', label: 'Display', align: 'left', render: (row) => row.display },
          { id: 'points', label: 'PTS', align: 'right', render: (row) => row.points },
        ]}
        rows={[
          { id: 'a', display: 'Alpha', points: 2 },
          { id: 'b', display: 'Beta', points: 8 },
        ]}
      />
    );

    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Alpha')).toBeInTheDocument();
  });
});
