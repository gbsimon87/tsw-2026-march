import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { InstagramConnectionPage } from './InstagramConnectionPage';

const apiMocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  startOAuth: vi.fn(),
  verify: vi.fn(),
  refreshToken: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('../api/instagramApi', () => ({ instagramApi: apiMocks }));
vi.mock('../components/InstagramSocialPostPanel', () => ({
  InstagramSocialPostPanel: () => <div>Instagram post drafts</div>,
}));

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
    expect(screen.queryByText('encrypted-secret')).not.toBeInTheDocument();
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

  test('warns about an expiring token and lets the operator refresh it', async () => {
    apiMocks.getStatus.mockResolvedValue({
      configured: true,
      connection: {
        username: 'tsw_test',
        accountId: '1',
        tokenExpiresAt: '2026-09-10T12:00:00.000Z',
        tokenHealth: { status: 'expiring', canRefresh: true, lastRefreshFailed: false },
      },
    });
    apiMocks.refreshToken.mockResolvedValue({
      connection: {
        username: 'tsw_test',
        accountId: '1',
        tokenExpiresAt: '2026-11-03T12:00:00.000Z',
        lastTokenRefreshedAt: '2026-09-04T12:00:00.000Z',
        tokenHealth: { status: 'healthy', canRefresh: false, lastRefreshFailed: false },
      },
    });
    render(
      <MemoryRouter>
        <InstagramConnectionPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/expires within 14 days/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh access token' }));
    await waitFor(() => expect(apiMocks.refreshToken).toHaveBeenCalledOnce());
    expect(await screen.findByText(/refreshed successfully/i)).toBeInTheDocument();
  });
});
