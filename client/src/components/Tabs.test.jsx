import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { Tabs } from './Tabs';

const items = [
  { value: 'first', label: 'First', content: <p>First panel</p> },
  { value: 'second', label: 'Second', content: <p>Second panel</p> },
];

describe('Tabs', () => {
  test('preserves the standard spacing for non-sticky tabs', () => {
    render(<Tabs items={items} />);

    expect(screen.getByRole('tab', { name: 'First' })).toHaveClass('py-3');
    expect(screen.getByRole('tablist')).not.toHaveClass('h-14', 'sm:h-12');
  });

  test('uses fixed responsive heights when its tab list is sticky', () => {
    render(<Tabs items={items} stickyTabList ariaLabel="Sticky sections" />);

    expect(screen.getByRole('tablist', { name: 'Sticky sections' })).toHaveClass(
      'sticky',
      'h-14',
      'sm:h-12'
    );
    expect(screen.getByRole('tab', { name: 'First' })).toHaveClass('h-full', 'py-2');

    fireEvent.click(screen.getByRole('tab', { name: 'Second' }));
    expect(screen.getByText('Second panel')).toBeInTheDocument();
  });
});
