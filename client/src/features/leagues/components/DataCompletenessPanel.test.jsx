import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataCompletenessPanel } from './DataCompletenessPanel';

afterEach(cleanup);

function report(overrides = {}) {
  return {
    seasonId: '507f1f77bcf86cd799439021',
    seasonName: 'Spring 2026',
    generatedAt: '2026-08-09T12:00:00.000Z',
    counts: { high: 1, medium: 1, low: 0, dismissed: 1 },
    categories: [
      {
        key: 'overdue_game',
        label: 'Overdue games',
        description: 'Scheduled more than 48 hours ago but never started.',
        severity: 'high',
        items: [
          {
            issueKey: 'overdue_game:1',
            label: 'Hoops at Ballers',
            detail: 'Scheduled 3 days ago, never started',
            href: '/admin/games/1',
            dismissed: false,
          },
        ],
      },
      {
        key: 'roster_too_small',
        label: 'Rosters below minimum',
        description: 'Fewer than 5 active players.',
        severity: 'medium',
        items: [
          {
            issueKey: 'roster_too_small:2',
            label: 'Ballers',
            detail: 'Only 3 active players (needs 5)',
            href: '/admin/leagues/teams/2',
            dismissed: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function renderPanel(props = {}) {
  return render(
    <DataCompletenessPanel
      report={report()}
      isLoading={false}
      error={null}
      canDismiss
      onDismiss={() => {}}
      onRestore={() => {}}
      {...props}
    />
  );
}

describe('DataCompletenessPanel', () => {
  it('renders categories with their counts', () => {
    renderPanel();
    expect(screen.getByText('Overdue games')).toBeInTheDocument();
    expect(screen.getByText('Hoops at Ballers')).toBeInTheDocument();
  });

  it('orders high severity categories before medium', () => {
    renderPanel();
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings[0]).toHaveTextContent('Overdue games');
  });

  it('separates dismissed items from active ones', () => {
    renderPanel();
    expect(screen.getByText(/Dismissed \(1\)/i)).toBeInTheDocument();
  });

  it('links each item to where it gets fixed', () => {
    renderPanel();
    const link = screen.getByRole('link', { name: /Hoops at Ballers/i });
    expect(link).toHaveAttribute('href', '/admin/games/1');
  });

  it('calls onDismiss with the issue key', () => {
    const onDismiss = vi.fn();
    renderPanel({ onDismiss });
    fireEvent.click(screen.getByRole('button', { name: /Dismiss Hoops at Ballers/i }));
    expect(onDismiss).toHaveBeenCalledWith('overdue_game:1');
  });

  it('calls onRestore for a dismissed item', () => {
    const onRestore = vi.fn();
    renderPanel({ onRestore });
    fireEvent.click(screen.getByRole('button', { name: /Restore Ballers/i }));
    expect(onRestore).toHaveBeenCalledWith('roster_too_small:2');
  });

  it('hides dismiss controls when the viewer cannot dismiss', () => {
    renderPanel({ canDismiss: false });
    expect(screen.queryByRole('button', { name: /Dismiss/i })).not.toBeInTheDocument();
  });

  it('reassures when nothing is wrong', () => {
    renderPanel({
      report: report({ categories: [], counts: { high: 0, medium: 0, low: 0, dismissed: 0 } }),
    });
    expect(screen.getByText(/Everything looks complete/i)).toBeInTheDocument();
  });

  it('explains when the league has no active season', () => {
    renderPanel({
      report: report({
        seasonId: null,
        seasonName: null,
        categories: [],
        counts: { high: 0, medium: 0, low: 0, dismissed: 0 },
      }),
    });
    expect(screen.getByText(/no active season/i)).toBeInTheDocument();
  });

  it('surfaces the real error message', () => {
    renderPanel({ report: null, error: 'League has no active season' });
    expect(screen.getByText('League has no active season')).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    renderPanel({ report: null, isLoading: true });
    expect(screen.getByText(/Checking/i)).toBeInTheDocument();
  });
});
