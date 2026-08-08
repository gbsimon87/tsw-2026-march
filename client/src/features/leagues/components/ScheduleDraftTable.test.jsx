import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScheduleDraftTable } from './ScheduleDraftTable';

const teams = [
  { id: 't1', name: 'Hawks' },
  { id: 't2', name: 'Bisons' },
  { id: 't3', name: 'Owls' },
];

function gameRow(overrides = {}) {
  return {
    id: 'row-1',
    round: 1,
    isBye: false,
    homeLeagueTeamId: 't1',
    awayLeagueTeamId: 't2',
    scheduledAt: new Date(2026, 8, 5, 10, 0),
    venue: 'Court 1',
    overflowed: false,
    ...overrides,
  };
}

const byeRow = { id: 'row-2', round: 1, isBye: true, byeTeamId: 't3' };

function setup(overrides = {}) {
  const props = {
    rows: [gameRow(), byeRow],
    teams,
    onChangeRow: vi.fn(),
    onSwapSides: vi.fn(),
    onRemoveRow: vi.fn(),
    ...overrides,
  };

  const utils = render(<ScheduleDraftTable {...props} />);
  return { ...props, ...utils };
}

afterEach(cleanup);

describe('ScheduleDraftTable', () => {
  it('renders both team names for a game row', () => {
    setup();

    expect(screen.getAllByText('Hawks').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bisons').length).toBeGreaterThan(0);
  });

  it('shows a bye row naming the resting team', () => {
    setup();

    expect(screen.getAllByText('Owls').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/bye/i).length).toBeGreaterThan(0);
  });

  it('swaps sides when the swap control is used', () => {
    const { onSwapSides } = setup();

    fireEvent.click(screen.getAllByRole('button', { name: /swap home and away/i })[0]);

    expect(onSwapSides).toHaveBeenCalledWith('row-1');
  });

  it('removes a game row', () => {
    const { onRemoveRow } = setup();

    fireEvent.click(screen.getAllByRole('button', { name: /remove game/i })[0]);

    expect(onRemoveRow).toHaveBeenCalledWith('row-1');
  });

  it('edits the venue', () => {
    const { onChangeRow } = setup();

    fireEvent.change(screen.getAllByLabelText(/venue/i)[0], { target: { value: 'Court 2' } });

    expect(onChangeRow).toHaveBeenCalledWith('row-1', { venue: 'Court 2' });
  });

  it('edits the date and time, passing a Date up', () => {
    const { onChangeRow } = setup();

    fireEvent.change(screen.getAllByLabelText(/date and time/i)[0], {
      target: { value: '2026-09-12T11:30' },
    });

    const [rowId, patch] = onChangeRow.mock.calls.at(-1);
    expect(rowId).toBe('row-1');
    expect(patch.scheduledAt).toBeInstanceOf(Date);
    expect(patch.scheduledAt.getDate()).toBe(12);
    expect(patch.scheduledAt.getHours()).toBe(11);
    expect(patch.scheduledAt.getMinutes()).toBe(30);
  });

  it('renders the stored time in local wall-clock form, not UTC-shifted', () => {
    setup({ rows: [gameRow({ scheduledAt: new Date(2026, 8, 5, 10, 0) })] });

    expect(screen.getAllByLabelText(/date and time/i)[0].value).toBe('2026-09-05T10:00');
  });

  it('ignores an unparseable date instead of emitting an invalid Date', () => {
    const { onChangeRow } = setup();

    fireEvent.change(screen.getAllByLabelText(/date and time/i)[0], { target: { value: '' } });

    expect(onChangeRow).not.toHaveBeenCalled();
  });

  it('marks a row that was moved because slots ran out', () => {
    setup({ rows: [gameRow({ overflowed: true })] });

    expect(screen.getAllByText(/moved to a later date/i).length).toBeGreaterThan(0);
  });

  it('does not mark a row that fit its slot', () => {
    setup({ rows: [gameRow()] });

    expect(screen.queryByText(/moved to a later date/i)).not.toBeInTheDocument();
  });

  it('gives a bye row no editable controls', () => {
    setup({ rows: [byeRow] });

    expect(screen.queryByLabelText(/venue/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /swap home and away/i })).not.toBeInTheDocument();
  });

  it('lets a bye row be removed', () => {
    const { onRemoveRow } = setup({ rows: [byeRow] });

    fireEvent.click(screen.getAllByRole('button', { name: /remove bye/i })[0]);

    expect(onRemoveRow).toHaveBeenCalledWith('row-2');
  });

  it('names controls after the matchup, never the internal row id', () => {
    const { container } = setup({ rows: [gameRow()] });

    expect(
      screen.getAllByRole('button', { name: 'Remove game Bisons at Hawks' }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', { name: 'Swap home and away for Bisons at Hawks' }).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Venue for Bisons at Hawks').length).toBeGreaterThan(0);

    // No visible or accessible text should expose a `row-N` id.
    expect(container.textContent).not.toMatch(/row-\d/);
    const accessibleNames = [...container.querySelectorAll('[aria-label]')].map((el) =>
      el.getAttribute('aria-label')
    );
    expect(accessibleNames.every((name) => !/row-\d/.test(name))).toBe(true);
  });

  it('renders an empty state when there are no rows', () => {
    setup({ rows: [] });

    expect(screen.getByText(/no games/i)).toBeInTheDocument();
  });

  it('falls back gracefully when a team id is unknown', () => {
    setup({ rows: [gameRow({ homeLeagueTeamId: 'missing' })] });

    expect(screen.getAllByText(/unknown team/i).length).toBeGreaterThan(0);
  });

  it('labels each round once', () => {
    setup({
      rows: [
        gameRow(),
        gameRow({ id: 'row-9', round: 2, scheduledAt: new Date(2026, 8, 12, 10, 0) }),
      ],
    });

    expect(screen.getAllByText(/round 1/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/round 2/i).length).toBeGreaterThan(0);
  });

  it('renders a table for wide viewports and cards for phones', () => {
    const { container } = setup({ rows: [gameRow()] });

    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    // The table half is hidden on phones; the card half is hidden from `sm` up.
    expect(table.closest('div[class*="hidden"]')).not.toBeNull();

    const cards = container.querySelector('[data-testid="schedule-draft-cards"]');
    expect(cards).not.toBeNull();
    expect(cards.className).toContain('sm:hidden');
    expect(within(cards).getAllByRole('button', { name: /remove game/i }).length).toBeGreaterThan(
      0
    );
  });
});
