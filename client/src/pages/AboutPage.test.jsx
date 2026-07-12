import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test } from 'vitest';
import { AboutPage } from './AboutPage';

describe('AboutPage', () => {
  afterEach(() => {
    cleanup();
  });

  test('renders the three audience images', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('img', { name: /players reviewing basketball progress and development/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: /coaches and managers using basketball performance insights/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: /friends and family following basketball team highlights/i,
      })
    ).toBeInTheDocument();
  });
});
