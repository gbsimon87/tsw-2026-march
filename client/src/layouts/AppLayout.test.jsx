import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { AppLayout } from './AppLayout';
import { AuthProvider } from '../app/store/AuthContext';

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>
          <AppLayout />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// The header centres its content in an inner div; main and footer are centred
// directly. All three must agree or the header rule and footer border stop
// lining up with the page content.
function getShellContainers() {
  return {
    header: screen.getByRole('banner').firstElementChild,
    main: screen.getByRole('main'),
    footer: screen.getByRole('contentinfo'),
  };
}

describe('AppLayout shell width', () => {
  test('centres header, main and footer at the same wide max width', () => {
    renderShell();
    const { header, main, footer } = getShellContainers();

    for (const el of [header, main, footer]) {
      expect(el).toHaveClass('mx-auto', 'max-w-7xl');
    }
  });

  test('keeps the p-4 gutter that full-bleed pages escape with -m-4', () => {
    renderShell();

    // PrivacyPage and ContactPage render a nested <main> with `-m-4 p-4` to
    // bleed their background past this gutter. Changing it breaks them.
    expect(screen.getByRole('main')).toHaveClass('p-4');
  });

  test('links Pricing from both desktop and mobile navigation', () => {
    renderShell();

    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation menu' }));

    const pricingLinks = screen.getAllByRole('link', { name: 'Pricing' });
    expect(pricingLinks).toHaveLength(2);
    expect(pricingLinks.every((link) => link.getAttribute('href') === '/pricing')).toBe(true);
  });
});
