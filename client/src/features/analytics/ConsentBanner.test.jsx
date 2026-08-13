import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const posthogLibMocks = vi.hoisted(() => ({
  acceptPostHogConsent: vi.fn(),
  declinePostHogConsent: vi.fn(),
  isPostHogEnabled: vi.fn(() => true),
}));

const trackEventMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/posthog', () => posthogLibMocks);
vi.mock('./trackEvent', () => ({ trackEvent: trackEventMock }));

import { ConsentBanner, openConsentSettings } from './ConsentBanner';
import {
  CONSENT_ACCEPTED,
  CONSENT_DECLINED,
  CONSENT_VERSION,
  readConsent,
} from '../../lib/consent';

// This project's jsdom exposes window.localStorage as a bare object with no
// Storage methods, so storage-backed tests supply their own.
function installStorageStub() {
  const store = new Map();

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear(),
    },
  });
}

function renderBanner() {
  return render(
    <MemoryRouter>
      <ConsentBanner />
    </MemoryRouter>
  );
}

beforeEach(() => {
  installStorageStub();
  vi.clearAllMocks();
  posthogLibMocks.isPostHogEnabled.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
});

describe('ConsentBanner', () => {
  test('shows to an undecided visitor', () => {
    renderBanner();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
  });

  test('offers Accept and Decline with equal prominence', () => {
    renderBanner();

    // Consent must be freely given, so declining cannot be hidden behind a
    // link or a settings panel while accepting is a single button.
    const accept = screen.getByRole('button', { name: 'Accept' });
    const decline = screen.getByRole('button', { name: 'Decline' });

    expect(accept.tagName).toBe(decline.tagName);
  });

  test('links to the privacy policy so consent is informed', () => {
    renderBanner();

    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
  });

  test('accepting stores the decision and upgrades persistence', () => {
    renderBanner();

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(readConsent()).toBe(CONSENT_ACCEPTED);
    expect(posthogLibMocks.acceptPostHogConsent).toHaveBeenCalled();
    expect(trackEventMock).toHaveBeenCalledWith('consent_decision', { decision: 'accepted' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('declining stores the decision and clears stored analytics state', () => {
    renderBanner();

    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));

    expect(readConsent()).toBe(CONSENT_DECLINED);
    expect(posthogLibMocks.declinePostHogConsent).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('records the decline before clearing, so it is not lost', () => {
    renderBanner();

    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));

    // consent_decision is the denominator for what share of traffic is
    // attributable, so it has to survive the reset that follows it.
    expect(trackEventMock).toHaveBeenCalledWith('consent_decision', { decision: 'declined' });

    const captureOrder = trackEventMock.mock.invocationCallOrder[0];
    const resetOrder = posthogLibMocks.declinePostHogConsent.mock.invocationCallOrder[0];
    expect(captureOrder).toBeLessThan(resetOrder);
  });

  test('stays hidden once a decision has been made', () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    cleanup();

    renderBanner();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('reopens when the visitor asks to change their choice', () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Withdrawal must be as easy as consenting (GDPR Art. 7(3)).
    fireEvent(window, new CustomEvent('tsw:open-consent-settings'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('openConsentSettings reopens the banner', () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    // act() so React flushes the state update the dispatched event triggers.
    act(() => {
      openConsentSettings();
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('does not show when analytics is disabled for the environment', () => {
    posthogLibMocks.isPostHogEnabled.mockReturnValue(false);

    renderBanner();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('applies an accepted decision received from another tab', () => {
    renderBanner();
    window.localStorage.setItem(
      'tsw_consent',
      JSON.stringify({
        decision: CONSENT_ACCEPTED,
        version: CONSENT_VERSION,
        decidedAt: new Date().toISOString(),
      })
    );

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'tsw_consent' }));
    });

    expect(posthogLibMocks.acceptPostHogConsent).toHaveBeenCalledTimes(1);
    expect(posthogLibMocks.declinePostHogConsent).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('applies a declined decision received from another tab', () => {
    renderBanner();
    window.localStorage.setItem(
      'tsw_consent',
      JSON.stringify({
        decision: CONSENT_DECLINED,
        version: CONSENT_VERSION,
        decidedAt: new Date().toISOString(),
      })
    );

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'tsw_consent' }));
    });

    expect(posthogLibMocks.declinePostHogConsent).toHaveBeenCalledTimes(1);
    expect(posthogLibMocks.acceptPostHogConsent).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
