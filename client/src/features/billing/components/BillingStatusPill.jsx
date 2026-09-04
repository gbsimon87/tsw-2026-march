import { useState } from 'react';
import { Link } from 'react-router-dom';
import { billingApi } from '../api/billingApi';

const LEAGUE_PLAN_VALUES = new Set(['league', 'pro']);

// Defense-in-depth (the server validates too, T-09).
function isSafeStripeUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'checkout.stripe.com' || parsed.hostname === 'billing.stripe.com')
    );
  } catch {
    return false;
  }
}

function planLabel(scope, billing) {
  if (scope === 'league') {
    if (billing?.plan === 'league_plus') return 'League Plus';
    return LEAGUE_PLAN_VALUES.has(billing?.plan) ? 'League' : 'Read-only League';
  }
  return billing?.capacityType === 'free' ? 'Free Team' : 'Additional Team';
}

// Small read-only billing affordance (T-22): shows the resolved plan and a link to
// the Stripe Customer Portal (active) or /pricing (not active). Not a billing
// dashboard — just status + one action.
// A status carries a Stripe billing relationship (so the portal is the right action)
// whenever the resource has a Stripe subscription that should be managed instead
// of duplicated through a second Checkout Session.
const PORTAL_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused']);

export function BillingStatusPill({ billing, scope = 'team', resourceId }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const status = billing?.subscriptionStatus;
  const label = planLabel(scope, billing);
  // Open subscriptions belong in the portal so payment recovery stays attached
  // to the existing subscription.
  const portalEligible = PORTAL_STATUSES.has(status) && billing?.managedByStripe !== false;

  async function manageBilling() {
    setBusy(true);
    setError('');
    try {
      const res = await billingApi.createCustomerPortalSession(
        scope === 'league' ? { leagueId: resourceId } : { teamId: resourceId }
      );
      if (res?.url && isSafeStripeUrl(res.url)) {
        window.location.assign(res.url);
        return; // navigating away — keep the button in its busy state
      }
      // Audit M8: an unexpected/empty/unsafe URL must surface, not hang on "Opening…".
      setError('Could not open billing portal');
    } catch {
      setError('Could not open billing portal');
    } finally {
      // Audit M8: always clear busy (previously only the catch did, so a missing/
      // unsafe URL left the button stuck on "Opening…").
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
      <span>
        Plan: <span className="font-semibold text-slate-800">{label}</span>
      </span>
      {scope === 'team' && billing?.capacityType === 'free' ? (
        <span className="text-emerald-700">Included</span>
      ) : billing?.managedByStripe === false ? (
        <span className="text-emerald-700">Complimentary</span>
      ) : portalEligible ? (
        <button
          type="button"
          onClick={manageBilling}
          disabled={busy}
          className="text-[#1B4332] underline decoration-[#F4A300] decoration-2 underline-offset-2 hover:text-[#F4A300] disabled:opacity-60"
        >
          {busy ? 'Opening…' : 'Manage billing →'}
        </button>
      ) : (
        <Link
          to={
            scope === 'league'
              ? `/pricing?leagueId=${encodeURIComponent(resourceId)}`
              : `/pricing?teamId=${encodeURIComponent(resourceId)}`
          }
          className="text-[#1B4332] underline decoration-[#F4A300] decoration-2 underline-offset-2 hover:text-[#F4A300]"
        >
          Upgrade →
        </Link>
      )}
      {error ? <span className="text-rose-600">{error}</span> : null}
    </span>
  );
}
