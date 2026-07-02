import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { PageHeader } from '../../../components/PageHeader';
import { billingApi } from '../api/billingApi';
import { teamsApi } from '../../teams/api/teamsApi';
import { leaguesApi } from '../../leagues/api/leaguesApi';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

function isActivePlan(billing, planValues) {
  return planValues.includes(billing?.plan) && ACTIVE_STATUSES.has(billing?.subscriptionStatus);
}

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

const PRICES = {
  team: { monthly: '$12/mo', season: '$89/season' },
  league: { monthly: '$49/mo', season: '$299/season' },
};

const FREE_FEATURES = [
  'Public team and player pages',
  'My Sporty profile (claimed league player)',
  'View stats on public pages',
  'Post to The Pulse (if affiliated with a team or league)',
];

const TEAM_FEATURES = [
  'Everything in Free',
  'Full game tracking (shots, lineups, subs, all stat types)',
  'Box score, recap, and play-by-play',
  'Replay tab',
  'Shot maps on public game pages',
  'Highlight clip sharing',
  'Per team — each team needs its own plan',
];

const LEAGUE_FEATURES = [
  'Everything in Team, for all teams in the league',
  'League creation and management',
  'Dual-team tracking for league games',
  'Standings and public league pages',
  'Join request system',
  'Multiple league managers',
  'League logo and branding',
  'Per league — each league needs its own plan',
];

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
      {features.map((f) => (
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
      <p className="mt-3 text-sm text-slate-600">{description}</p>
      <FeatureList features={features} />
      <div className="mt-6 space-y-3">{children}</div>
    </article>
  );
}

export function PricingPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const [interval, setInterval] = useState('monthly');
  const [teams, setTeams] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedLeagueId, setSelectedLeagueId] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSubmittingTeam, setIsSubmittingTeam] = useState(false);
  const [isSubmittingLeague, setIsSubmittingLeague] = useState(false);
  const [error, setError] = useState('');

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

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId]
  );
  const selectedLeague = useMemo(
    () => leagues.find((l) => l.id === selectedLeagueId) ?? null,
    [leagues, selectedLeagueId]
  );

  const teamIsActive = isActivePlan(selectedTeam?.billing, ['team', 'pro']);
  const leagueIsActive = isActivePlan(selectedLeague?.billing, ['league', 'pro']);

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

  const teamPrice = PRICES.team[interval];
  const leaguePrice = PRICES.league[interval];

  return (
    <main className="space-y-10">
      <PageHeader
        eyebrow="Pricing"
        title="Start your free trial today."
        description="14-day free trial on Team and League plans — card required upfront, cancel any time."
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {/* Interval toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-700">Billing:</span>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
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
          <span className="text-xs text-emerald-700 font-medium">Save ~40%</span>
        )}
      </div>

      <section className="grid gap-6 lg:grid-cols-3">
        {/* Free */}
        <PlanCard
          title="Free"
          price="$0"
          description="Browse, view stats, and post to The Pulse if you're part of a team or league."
          features={FREE_FEATURES}
        >
          <Link
            to="/pulse"
            className="block w-full rounded-lg border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            View The Pulse
          </Link>
        </PlanCard>

        {/* Team */}
        <PlanCard
          title="Team"
          price={teamPrice}
          trial="14-day free trial · card required upfront"
          description="Full game tracking and post-game review for one team."
          features={TEAM_FEATURES}
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
                        {isActivePlan(t.billing, ['team', 'pro']) ? ' ✓ Active' : ''}
                      </option>
                    ))}
                  </select>
                  {selectedTeam && (
                    <span className="mt-1 block text-xs text-slate-500">
                      {selectedTeam.billing?.plan || 'free'}
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
                  aria-label={
                    isSubmittingTeam
                      ? 'Redirecting…'
                      : teamIsActive
                        ? 'Manage Team Billing'
                        : 'Start 14-day Trial'
                  }
                  className="w-full rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
                >
                  {isSubmittingTeam
                    ? 'Redirecting…'
                    : teamIsActive
                      ? 'Manage Team Billing'
                      : 'Start 14-day Trial'}
                </button>
              )}
            </>
          ) : (
            <Link
              to="/register?redirectTo=/pricing"
              className="block w-full rounded-lg bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Start 14-day Trial
            </Link>
          )}
        </PlanCard>

        {/* League */}
        <PlanCard
          title="League"
          price={leaguePrice}
          trial="14-day free trial · card required upfront"
          description="Run a full league — tracking, standings, and public pages for every team."
          features={LEAGUE_FEATURES}
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
                        {isActivePlan(l.billing, ['league', 'pro']) ? ' ✓ Active' : ''}
                      </option>
                    ))}
                  </select>
                  {selectedLeague && (
                    <span className="mt-1 block text-xs text-slate-500">
                      {selectedLeague.billing?.plan || 'free'}
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
                aria-label={
                  isSubmittingLeague
                    ? 'Redirecting…'
                    : leagueIsActive
                      ? 'Manage League Billing'
                      : 'Start 14-day Trial'
                }
                className="w-full rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
              >
                {isSubmittingLeague
                  ? 'Redirecting…'
                  : leagueIsActive
                    ? 'Manage League Billing'
                    : 'Start 14-day Trial'}
              </button>
            </>
          ) : (
            <Link
              to="/register?redirectTo=/pricing"
              className="block w-full rounded-lg bg-slate-900 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Start 14-day Trial
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
