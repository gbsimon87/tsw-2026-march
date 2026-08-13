// Analytics consent (UK PUECR / GDPR). See docs/analytics-plan.md §3.
//
// The rule that shapes this module: the obligation attaches to *writing an
// identifier to the device*, not to what the identifier contains. So before
// consent PostHog runs with `persistence: 'memory'` — no cookie, no
// localStorage, nothing to consent to — and anonymous pageviews are still
// counted so traffic totals stay honest for people who decline.
//
// Storing the decision itself is exempt: it is strictly necessary to honour
// the choice the visitor made.

const STORAGE_KEY = 'tsw_consent';

// Bump when the events, purposes, or processors change. A visitor whose stored
// decision predates the current version is asked again rather than assumed to
// have agreed to something they never saw. Keep in step with the "last updated"
// date on PrivacyPage.
export const CONSENT_VERSION = 1;

// Consent goes stale. The ICO expects it to be refreshed at reasonable
// intervals; 12 months is the common reading.
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export const CONSENT_ACCEPTED = 'accepted';
export const CONSENT_DECLINED = 'declined';

function isFresh(record, now) {
  if (record.version !== CONSENT_VERSION) {
    return false;
  }

  const decidedAt = Date.parse(record.decidedAt);

  // An unparseable or future timestamp means a corrupted or tampered record —
  // treat it as no decision rather than trusting it.
  return Number.isFinite(decidedAt) && decidedAt <= now && now - decidedAt < MAX_AGE_MS;
}

/**
 * The visitor's current decision, or null if they have not made one, their
 * choice has expired, or it predates the current consent version.
 *
 * Returns null rather than throwing when storage is unavailable (Safari private
 * mode, storage disabled): no stored decision means no consent, which is the
 * safe default.
 */
export function readConsent(now = Date.now()) {
  let raw = null;

  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const record = JSON.parse(raw);
    if (
      (record.decision === CONSENT_ACCEPTED || record.decision === CONSENT_DECLINED) &&
      isFresh(record, now)
    ) {
      return record.decision;
    }
  } catch {
    // Malformed JSON — fall through and treat as undecided.
  }

  return null;
}

// Consent changes have to reach code that already rendered — the route tracker
// needs to identify a signed-in user once they accept, and a banner open in a
// second tab needs to close when the choice is made in the first.
export const CONSENT_CHANGED_EVENT = 'tsw:consent-changed';

function announceConsentChange() {
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT));
}

/**
 * Subscribe to consent changes in this tab and in others. Returns an
 * unsubscribe function.
 */
export function onConsentChange(listener) {
  function handleStorage(event) {
    // key is null when storage is cleared wholesale.
    if (event.key === null || event.key === STORAGE_KEY) {
      listener();
    }
  }

  window.addEventListener(CONSENT_CHANGED_EVENT, listener);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(CONSENT_CHANGED_EVENT, listener);
    window.removeEventListener('storage', handleStorage);
  };
}

export function writeConsent(decision, now = Date.now()) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        decision,
        version: CONSENT_VERSION,
        decidedAt: new Date(now).toISOString(),
      })
    );
  } catch {
    // Storage unavailable. The decision holds for this page view but cannot be
    // remembered; the banner will ask again next visit. Better than failing.
  }

  announceConsentChange();
}

export function clearConsent() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — see writeConsent.
  }
}

export function hasAccepted(now = Date.now()) {
  return readConsent(now) === CONSENT_ACCEPTED;
}
