import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { AuthProvider } from './app/store/AuthContext';

describe('App shell', () => {
  test('renders branding text', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <AppLayout />
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByText(/tsw-2026-march/i)).toBeInTheDocument();
  });
});
