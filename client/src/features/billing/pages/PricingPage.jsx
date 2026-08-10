import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { PageHeader } from '../../../components/PageHeader';
import { billingApi } from '../api/billingApi';
import { teamsApi } from '../../teams/api/teamsApi';
import { leaguesApi } from '../../leagues/api/leaguesApi';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

// Canonical plan ids are 'team_pro'/'league'; legacy 'team'/'pro' tolerated during
// the migration window (a doc may still carry an un-migrated value).
const TEAM_PLAN_VALUES = ['team_pro', 'team', 'pro'];
const LEAGUE_PLAN_VALUES = ['league', 'pro'];

function isActivePlan(billing, planValues) {
  return planValues.includes(billing?.plan) && ACTIVE_STATUSES.has(billing?.subscriptionStatus);
}

// Defense-in-depth: the server also validates the returned URL (T-09), but keep the
// client guard so a bad URL never reaches window.location.
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

function CheckIcon() {
  return (
    <span aria-hidden="true" className="text-emerald-600">
      ✓
    </span>
  );
}

function FeatureList({ features }) {
  return (
    <ul className="mt-5 space-y-2 text-sm text-slate-700">
      {(features || []).map((f) => (
        <li key={f} className="flex gap-2">
          <CheckIcon />
          <span>{f}</span>
        </li>
      ))}
    </ul>
  );
}

function PlanCard({ title, price, trial, description, features, accent = 'slate', children }) {
  const border =
    accent === 'amber'
      ? 'border-amber-300 bg-gradient-to-b from-amber-50 via-white to-white'
      : accent === 'violet'
        ? 'border-violet-300 bg-gradient-to-b from-violet-50 via-white to-white'
        : 'border-slate-200 bg-white';

  return (
    <article className={`rounded-3xl border p-6 shadow-sm ${border}`}>
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-3 text-3xl font-bold text-slate-900">{price}</p>
      {trial && <p className="mt-1 text-xs font-medium text-emerald-700">{trial}</p>}
      {description && <p className="mt-3 text-sm text-slate-600">{description}</p>}
      <FeatureList features={features} />
      <div className="mt-6 space-y-3">{children}</div>
    </article>
  );
}

// Display price for a plan at the selected interval, from the served catalog.
function planPrice(plan, interval) {
  if (!plan) return '';
  if (plan.price) return plan.price; // e.g. Starter → 'Free'
  return plan.intervals?.[interval]?.display || '';
}

function trialLabel(plan, interval) {
  const days = plan?.intervals?.[interval]?.trialDays;
  return days ? `${days}-day free trial · card required upfront` : null;
}

export function PricingPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const [interval, setInterval] = useState('monthly');
  const [catalog, setCatalog] = useState([]);
  const [teams, setTeams] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedLeagueId, setSelectedLeagueId] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSubmittingTeam, setIsSubmittingTeam] = useState(false);
  const [isSubmittingLeague, setIsSubmittingLeague] = useState(false);
  const [error, setError] = useState('');

  // Public catalog — fetched for everyone (drives all pricing copy; no client drift).
  useEffect(() => {
    billingApi
      .getCatalog()
      .then((res) => setCatalog(res.plans || []))
      .catch((err) => setError(err.message || 'Failed to load pricing'));
  }, []);

  useEffect(() => {
    if (!user) {
      setTeams([]);
      setLeagues([]);
      setSelectedTeamId('');
      setSelectedLeagueId('');
      return;
    }

    setIsLoadingData(true);
    Promise.all([teamsApi.list(), leaguesApi.list()])
      .then(([teamsRes, leaguesRes]) => {
        const nextTeams = teamsRes.teams || [];
        const nextLeagues = leaguesRes.leagues || leaguesRes || [];

        const requestedTeamId = searchParams.get('teamId');
        setTeams(nextTeams);
        setLeagues(nextLeagues);

        setSelectedTeamId(() => {
          if (requestedTeamId && nextTeams.some((t) => t.id === requestedTeamId)) {
            return requestedTeamId;
          }
          return nextTeams[0]?.id || '';
        });

        setSelectedLeagueId(nextLeagues[0]?.id || '');
      })
      .catch((err) => setError(err.message || 'Failed to load billing data'))
      .finally(() => setIsLoadingData(false));
  }, [searchParams, user]);

  const starterPlan = useMemo(() => catalog.find((p) => p.id === 'starter'), [catalog]);
  const teamPlan = useMemo(() => catalog.find((p) => p.id === 'team_pro'), [catalog]);
  const leaguePlan = useMemo(() => catalog.find((p) => p.id === 'league'), [catalog]);

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId]
  );
  const selectedLeague = useMemo(
    () => leagues.find((l) => l.id === selectedLeagueId) ?? null,
    [leagues, selectedLeagueId]
  );

  const teamIsActive = isActivePlan(selectedTeam?.billing, TEAM_PLAN_VALUES);
  const leagueIsActive = isActivePlan(selectedLeague?.billing, LEAGUE_PLAN_VALUES);

  async function handleTeamCheckout() {
    setError('');
    setIsSubmittingTeam(true);
    try {
      let response;
      if (teamIsActive) {
        response = await billingApi.createCustomerPortalSession({ teamId: selectedTeamId });
      } else {
        response = await billingApi.createTeamCheckoutSession(
          selectedTeamId || undefined,
          interval
        );
      }
      if (!response?.url || !isSafeStripeUrl(response.url)) {
        throw new Error('Invalid or missing checkout URL');
      }
      window.location.assign(response.url);
    } catch (err) {
      setError(err.message || 'Failed to start team checkout');
      setIsSubmittingTeam(false);
    }
  }

  async function handleLeagueCheckout() {
    setError('');
    setIsSubmittingLeague(true);
    try {
      let response;
      if (leagueIsActive && selectedLeagueId) {
        response = await billingApi.createCustomerPortalSession({ leagueId: selectedLeagueId });
      } else {
        response = await billingApi.createLeagueCheckoutSession(interval);
      }
      if (!response?.url || !isSafeStripeUrl(response.url)) {
        throw new Error('Invalid or missing checkout URL');
      }
      window.location.assign(response.url);
    } catch (err) {
      setError(err.message || 'Failed to start league checkout');
      setIsSubmittingLeague(false);
    }
  }

  const teamCtaLabel = isSubmittingTeam
    ? 'Redirecting…'
    : teamIsActive
      ? 'Manage Team Billing'
      : trialLabel(teamPlan, interval)
        ? 'Start free trial'
        : 'Subscribe';
  const leagueCtaLabel = isSubmittingLeague
    ? 'Redirecting…'
    : leagueIsActive
      ? 'Manage League Billing'
      : trialLabel(leaguePlan, interval)
        ? 'Start free trial'
        : 'Subscribe';

  return (
    <main className="space-y-10">
      <PageHeader
        eyebrow="Pricing"
        title="Track for free. Upgrade for the extras."
        description="Live stat tracking and box scores are free, forever. Team Pro and League unlock replay, shot maps, highlights, full history, CSV export, and league management."
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {/* Interval toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-700">Billing:</span>
        <div className="flex overflow-hidden rounded-lg border border-slate-200">
          {['monthly', 'season'].map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setInterval(opt)}
              aria-label={opt === 'monthly' ? 'Monthly' : 'Season'}
              className={`px-4 py-1.5 text-sm font-medium transition ${
                interval === opt
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opt === 'monthly' ? 'Monthly' : 'Season'}
            </button>
          ))}
        </div>
        {interval === 'season' && (
          <span className="text-xs font-medium text-emerald-700">Best value</span>
        )}
      </div>

      <section className="grid gap-6 lg:grid-cols-3">
        {/* Starter (Free) */}
        <PlanCard
          title={starterPlan?.name || 'Starter'}
          price={planPrice(starterPlan, interval) || 'Free'}
          description={starterPlan?.tagline}
          features={starterPlan?.features}
        >
          <Link
            to="/pulse"
            className="block w-full rounded-lg border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            View The Pulse
          </Link>
        </PlanCard>

        {/* Team Pro */}
        <PlanCard
          title={teamPlan?.name || 'Team Pro'}
          price={planPrice(teamPlan, interval)}
          trial={trialLabel(teamPlan, interval)}
          description={teamPlan?.tagline}
          features={teamPlan?.features}
          accent="amber"
        >
          {user ? (
            <>
              {teams.length > 0 ? (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Team to subscribe
                  </span>
                  <select
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    disabled={isLoadingData || isSubmittingTeam}
                  >
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {isActivePlan(t.billing, TEAM_PLAN_VALUES) ? ' ✓ Active' : ''}
                      </option>
                    ))}
                  </select>
                  {selectedTeam && (
                    <span className="mt-1 block text-xs text-slate-500">
                      {selectedTeam.billing?.plan || 'starter'}
                      {selectedTeam.billing?.subscriptionStatus
                        ? ` · ${selectedTeam.billing.subscriptionStatus}`
                        : ''}
                    </span>
                  )}
                </label>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-3 text-sm text-slate-600">
                  Create a team first, then come back to subscribe.
                </p>
              )}
              {teams.length === 0 ? (
                <Link
                  to="/teams/new?redirectTo=/pricing"
                  className="block w-full rounded-lg bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Create a Team
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={handleTeamCheckout}
                  disabled={isSubmittingTeam || isLoadingData}
                  aria-label={teamCtaLabel}
                  className="w-full rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                  {teamCtaLabel}
                </button>
              )}
            </>
          ) : (
            <Link
              to="/register?redirectTo=/pricing"
              className="block w-full rounded-lg bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Start free trial
            </Link>
          )}
        </PlanCard>

        {/* League */}
        <PlanCard
          title={leaguePlan?.name || 'League'}
          price={planPrice(leaguePlan, interval)}
          trial={trialLabel(leaguePlan, interval)}
          description={leaguePlan?.tagline}
          features={leaguePlan?.features}
          accent="violet"
        >
          {user ? (
            <>
              {leagues.length > 0 ? (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    League to subscribe
                  </span>
                  <select
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={selectedLeagueId}
                    onChange={(e) => setSelectedLeagueId(e.target.value)}
                    disabled={isLoadingData || isSubmittingLeague}
                  >
                    {leagues.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                        {isActivePlan(l.billing, LEAGUE_PLAN_VALUES) ? ' ✓ Active' : ''}
                      </option>
                    ))}
                  </select>
                  {selectedLeague && (
                    <span className="mt-1 block text-xs text-slate-500">
                      {selectedLeague.billing?.plan || 'starter'}
                      {selectedLeague.billing?.subscriptionStatus
                        ? ` · ${selectedLeague.billing.subscriptionStatus}`
                        : ''}
                    </span>
                  )}
                </label>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-3 text-sm text-slate-600">
                  You&apos;ll set up your league after checkout.
                </p>
              )}
              <button
                type="button"
                onClick={handleLeagueCheckout}
                disabled={isSubmittingLeague || isLoadingData}
                aria-label={leagueCtaLabel}
                className="w-full rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
              >
                {leagueCtaLabel}
              </button>
            </>
          ) : (
            <Link
              to="/register?redirectTo=/pricing"
              className="block w-full rounded-lg bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Start free trial
            </Link>
          )}
        </PlanCard>
      </section>

      <p className="text-center text-xs text-slate-500">
        Subscriptions managed through Stripe. Cancel any time from the billing portal.
      </p>
    </main>
  );
}
