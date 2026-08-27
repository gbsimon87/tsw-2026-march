import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { Tabs } from './Tabs';

const items = [
  { value: 'first', label: 'First', content: <p>First panel</p> },
  { value: 'second', label: 'Second', content: <p>Second panel</p> },
];

describe('Tabs', () => {
  test('leaves a non-sticky tab list free to size to its content', () => {
    render(<Tabs items={items} />);

    const tablist = screen.getByRole('tablist');
    expect(tablist).not.toHaveClass('sticky');
    expect(tablist).not.toHaveClass('h-14');
    expect(screen.getByRole('tab', { name: 'First' })).not.toHaveClass('h-full');
  });

  test('uses fixed responsive heights when its tab list is sticky', () => {
    render(<Tabs items={items} stickyTabList ariaLabel="Sticky sections" />);

    expect(screen.getByRole('tablist', { name: 'Sticky sections' })).toHaveClass(
      'sticky',
      'h-14',
      'sm:h-12'
    );
    // The tab fills the fixed row height so the sticky strip is exactly h-14 /
    // sm:h-12 — that is what a sticky element inside the panel offsets against.
    expect(screen.getByRole('tab', { name: 'First' })).toHaveClass('h-full');

    fireEvent.click(screen.getByRole('tab', { name: 'Second' }));
    expect(screen.getByText('Second panel')).toBeInTheDocument();
  });
});
