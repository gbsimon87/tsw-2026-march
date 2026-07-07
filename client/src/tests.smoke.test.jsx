import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { AppLayout } from './layouts/AppLayout';
import { AuthProvider } from './app/store/AuthContext';

describe('App shell', () => {
  test('renders branding text', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider>
            <AppLayout />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByRole('link', { name: 'TSW' })).toBeInTheDocument();
  });
});
