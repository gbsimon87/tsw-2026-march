import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { InstagramConnectionPage } from './InstagramConnectionPage';

const apiMocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  startOAuth: vi.fn(),
  verify: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('../api/instagramApi', () => ({ instagramApi: apiMocks }));

describe('InstagramConnectionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  test('shows setup guidance when OAuth is not configured', async () => {
    apiMocks.getStatus.mockResolvedValue({ configured: false, connection: null });
    render(
      <MemoryRouter>
        <InstagramConnectionPage />
      </MemoryRouter>
    );
    expect(await screen.findByText('Setup required')).toBeInTheDocument();
  });

  test('shows connected account metadata without any credential', async () => {
    apiMocks.getStatus.mockResolvedValue({
      configured: true,
      connection: {
        username: 'tsw_test',
        accountId: '17841400000000000',
        accountType: 'BUSINESS',
        lastVerifiedAt: '2026-08-23T10:00:00.000Z',
        tokenExpiresAt: '2026-10-22T10:00:00.000Z',
      },
    });
    render(
      <MemoryRouter>
        <InstagramConnectionPage />
      </MemoryRouter>
    );
    expect(await screen.findByText('@tsw_test')).toBeInTheDocument();
    expect(screen.getByText(/BUSINESS · ID 17841400000000000/)).toBeInTheDocument();
    expect(screen.queryByText(/access token/i)).not.toBeInTheDocument();
  });

  test('verifies the stored connection from the operator screen', async () => {
    apiMocks.getStatus.mockResolvedValue({
      configured: true,
      connection: { username: 'tsw_test', accountId: '1' },
    });
    apiMocks.verify.mockResolvedValue({
      connection: { username: 'tsw_verified', accountId: '1' },
    });
    render(
      <MemoryRouter>
        <InstagramConnectionPage />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Verify connection' }));
    await waitFor(() => expect(apiMocks.verify).toHaveBeenCalledOnce());
    expect(await screen.findByText('@tsw_verified')).toBeInTheDocument();
  });
});
