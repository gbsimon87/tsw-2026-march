import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CONSENT_ACCEPTED, CONSENT_DECLINED, readConsent, writeConsent } from '../../lib/consent';
import { acceptPostHogConsent, declinePostHogConsent, isPostHogEnabled } from '../../lib/posthog';
import { trackEvent } from './trackEvent';

// Other components ask the banner to reopen (the footer's "Cookie settings"
// link) without needing a shared store for one boolean.
const REOPEN_EVENT = 'tsw:open-consent-settings';

export function openConsentSettings() {
  window.dispatchEvent(new CustomEvent(REOPEN_EVENT));
}

export function ConsentBanner() {
  // Undecided visitors see the banner; a stored decision keeps it closed until
  // it expires, its version is bumped, or the footer link reopens it.
  const [isOpen, setIsOpen] = useState(() => isPostHogEnabled() && readConsent() === null);

  useEffect(() => {
    function reopen() {
      setIsOpen(true);
    }

    window.addEventListener(REOPEN_EVENT, reopen);
    return () => window.removeEventListener(REOPEN_EVENT, reopen);
  }, []);

  const decide = useCallback((decision) => {
    writeConsent(decision);

    if (decision === CONSENT_ACCEPTED) {
      acceptPostHogConsent();
      trackEvent('consent_decision', { decision });
    } else {
      // Capture before clearing: declinePostHogConsent() resets the client, and
      // this event is the denominator for what share of traffic is attributable.
      trackEvent('consent_decision', { decision });
      declinePostHogConsent();
    }

    setIsOpen(false);
  }, []);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-heading"
      aria-describedby="consent-description"
      // Sits *above* FeedTabBar (fixed bottom-0 z-40, mobile only) rather than
      // over it — bottom-16 clears its 4rem height, dropping to bottom-0 at md
      // where the tab bar is hidden. z-30 keeps it under both the tab bar and
      // the mobile menu (z-50), so the banner can never cover navigation or
      // trap someone inside an open menu.
      className="fixed inset-x-0 bottom-16 z-30 border-t border-slate-200 bg-white/95 p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur md:bottom-0 md:p-5"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h2 id="consent-heading" className="text-sm font-semibold text-slate-900">
            We use analytics cookies
          </h2>
          <p id="consent-description" className="mt-1 text-sm leading-relaxed text-slate-600">
            We&apos;d like to count visits and see which pages people find useful, so we can improve
            The Sporty Way. We never collect your name, email, or anything you type. You can change
            your mind any time.{' '}
            <Link to="/privacy" className="font-medium text-slate-700 underline underline-offset-2">
              Privacy
            </Link>
          </p>
        </div>

        {/* Equal weight, by design: GDPR requires consent to be freely given,
            so declining must be exactly as easy as accepting. */}
        <div className="flex shrink-0 gap-2.5">
          <button
            type="button"
            onClick={() => decide(CONSENT_DECLINED)}
            className="flex-1 rounded-lg border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 md:flex-none"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => decide(CONSENT_ACCEPTED)}
            className="flex-1 rounded-lg border border-slate-900 bg-[#141414] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1B4332] md:flex-none"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
