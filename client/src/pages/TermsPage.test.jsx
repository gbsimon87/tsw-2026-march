import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test } from 'vitest';
import { TermsPage } from './TermsPage';

function renderTerms() {
  return render(
    <MemoryRouter>
      <TermsPage />
    </MemoryRouter>
  );
}

describe('TermsPage', () => {
  afterEach(() => {
    cleanup();
  });

  test('states the permission that lets TSW publish game content to its own accounts', () => {
    renderTerms();

    // This clause is the contractual basis the Instagram integration relies on,
    // and Meta App Review reads it. Losing it silently would matter.
    expect(screen.getByRole('heading', { name: /your content/i })).toBeInTheDocument();
    expect(screen.getByText(/own social accounts/i)).toBeInTheDocument();
    expect(screen.getByText(/reviews and approves every such post/i)).toBeInTheDocument();
  });

  test('points at the privacy policy for the social and deletion detail', () => {
    renderTerms();

    // Meta's data-deletion instructions URL is /privacy#data-deletion, so these
    // anchors have to keep resolving.
    expect(screen.getByRole('link', { name: /deleting your data/i })).toHaveAttribute(
      'href',
      '/privacy#data-deletion'
    );
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy#social-publishing'
    );
  });

  test('covers the sections a Live Meta app is expected to publish', () => {
    renderTerms();

    for (const heading of [
      /your account/i,
      /using it fairly/i,
      /paid plans/i,
      /law, and getting/i,
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
  });
});
