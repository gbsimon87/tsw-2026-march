import { useState } from 'react';
import { Link } from 'react-router-dom';
import { billingApi } from '../api/billingApi';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const TEAM_PLAN_VALUES = new Set(['team_pro', 'team', 'pro']);
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

function planLabel(scope, plan) {
  if (scope === 'league') return LEAGUE_PLAN_VALUES.has(plan) ? 'League' : 'Starter';
  return TEAM_PLAN_VALUES.has(plan) ? 'Team Pro' : 'Starter';
}

// Small read-only billing affordance (T-22): shows the resolved plan and a link to
// the Stripe Customer Portal (active) or /pricing (not active). Not a billing
// dashboard — just status + one action.
export function BillingStatusPill({ billing, scope = 'team', resourceId }) {
  const [busy, setBusy] = useState(false);
  const plan = billing?.plan;
  const status = billing?.subscriptionStatus;
  const valid = scope === 'league' ? LEAGUE_PLAN_VALUES : TEAM_PLAN_VALUES;
  const active = ACTIVE_STATUSES.has(status) && valid.has(plan);
  const label = planLabel(scope, plan);

  async function manageBilling() {
    setBusy(true);
    try {
      const res = await billingApi.createCustomerPortalSession(
        scope === 'league' ? { leagueId: resourceId } : { teamId: resourceId }
      );
      if (res?.url && isSafeStripeUrl(res.url)) {
        window.location.assign(res.url);
      }
    } catch {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
      <span>
        Plan: <span className="font-semibold text-slate-800">{label}</span>
      </span>
      {active ? (
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
          to="/pricing"
          className="text-[#1B4332] underline decoration-[#F4A300] decoration-2 underline-offset-2 hover:text-[#F4A300]"
        >
          Upgrade →
        </Link>
      )}
    </span>
  );
}
