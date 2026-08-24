import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { PageHeader } from '../../../components/PageHeader';
import { SIGNUP_SOURCE, trackSignupCtaClicked } from '../../analytics/signupEvents';
import { leaguesApi } from '../../leagues/api/leaguesApi';
import { teamsApi } from '../../teams/api/teamsApi';
import { billingApi } from '../api/billingApi';

const PORTAL_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused']);

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

function FeatureList({ features }) {
  return (
    <ul className="mt-5 space-y-2 text-sm text-slate-700">
      {(features || []).map((feature) => (
        <li key={feature} className="flex gap-2">
          <span aria-hidden="true" className="text-emerald-600">
            ✓
          </span>
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );
}

function PlanCard({ title, price, description, trial, features, accent = false, children }) {
  return (
    <article
      className={`rounded-3xl border p-6 shadow-sm ${
        accent ? 'border-violet-300 bg-violet-50/40' : 'border-slate-200 bg-white'
      }`}
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-3 text-3xl font-bold text-slate-900">{price}</p>
      {trial ? <p className="mt-1 text-xs font-medium text-emerald-700">{trial}</p> : null}
      <p className="mt-3 text-sm text-slate-600">{description}</p>
      <FeatureList features={features} />
      <div className="mt-6 space-y-3">{children}</div>
    </article>
  );
}

function ResourceSelect({ label, value, onChange, resources, emptyLabel }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
      >
        {!resources.length ? <option value="">{emptyLabel}</option> : null}
        {resources.map((resource) => (
          <option key={resource.id} value={resource.id}>
            {resource.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SignupLink({ children, source }) {
  return (
    <Link
      to="/register"
      onClick={() => trackSignupCtaClicked(source)}
      className="block w-full rounded-xl bg-slate-900 px-4 py-2.5 text-center text-sm font-semibold text-white"
    >
      {children}
    </Link>
  );
}

export function PricingPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [catalog, setCatalog] = useState([]);
  const [teams, setTeams] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedLeagueId, setSelectedLeagueId] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [pendingAction, setPendingAction] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const isCreatingLeague =
    searchParams.get('resourceType') === 'league' && searchParams.get('action') === 'create';

  useEffect(() => {
    billingApi
      .getCatalog()
      .then((response) => setCatalog(response.plans || []))
      .catch((err) => setError(err.message || 'Failed to load pricing'));
  }, []);

  useEffect(() => {
    if (!user) {
      setTeams([]);
      setLeagues([]);
      return;
    }

    setIsLoadingData(true);
    Promise.all([teamsApi.list(), leaguesApi.list()])
      .then(([teamsResponse, leaguesResponse]) => {
        const nextTeams = teamsResponse.teams || [];
        const nextLeagues = leaguesResponse.leagues || leaguesResponse || [];
        const requestedTeamId = searchParams.get('teamId');
        const requestedLeagueId = searchParams.get('leagueId');

        setTeams(nextTeams);
        setLeagues(nextLeagues);
        setSelectedTeamId(
          requestedTeamId && nextTeams.some((team) => team.id === requestedTeamId)
            ? requestedTeamId
            : nextTeams.find((team) => team.billing?.capacityType === 'paid')?.id ||
                nextTeams[0]?.id ||
                ''
        );
        setSelectedLeagueId(
          requestedLeagueId && nextLeagues.some((league) => league.id === requestedLeagueId)
            ? requestedLeagueId
            : nextLeagues[0]?.id || ''
        );
      })
      .catch((err) => setError(err.message || 'Failed to load billing data'))
      .finally(() => setIsLoadingData(false));
  }, [searchParams, user]);

  const plans = useMemo(
    () => Object.fromEntries(catalog.map((plan) => [plan.id, plan])),
    [catalog]
  );
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || null;
  const selectedLeague = leagues.find((league) => league.id === selectedLeagueId) || null;
  const selectedTeamUsesPortal =
    PORTAL_STATUSES.has(selectedTeam?.billing?.subscriptionStatus) &&
    selectedTeam?.billing?.managedByStripe !== false;
  const selectedTeamIsFree = selectedTeam?.billing?.capacityType === 'free';
  const selectedLeagueUsesPortal =
    PORTAL_STATUSES.has(selectedLeague?.billing?.subscriptionStatus) &&
    selectedLeague?.billing?.managedByStripe !== false;
  const selectedLeagueIsComplimentary = selectedLeague?.billing?.managedByStripe === false;

  async function followStripeResponse(response) {
    if (response?.devRedirectPath) {
      window.location.assign(response.devRedirectPath);
      return;
    }
    if (!response?.url || !isSafeStripeUrl(response.url)) {
      throw new Error('Stripe did not return a safe checkout page.');
    }
    window.location.assign(response.url);
  }

  async function runAction(name, action) {
    setError('');
    setNotice('');
    setPendingAction(name);
    try {
      await action();
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setPendingAction('');
    }
  }

  function handleAdditionalTeam() {
    return runAction('team-checkout', async () => {
      const response = selectedTeamUsesPortal
        ? await billingApi.createCustomerPortalSession({ teamId: selectedTeamId })
        : await billingApi.createTeamCheckoutSession(selectedTeamId);
      await followStripeResponse(response);
    });
  }

  function handleChooseFreeTeam() {
    return runAction('free-team', async () => {
      await billingApi.chooseFreeTeam(selectedTeamId);
      setTeams((current) =>
        current.map((team) => ({
          ...team,
          billing: {
            ...team.billing,
            capacityType: team.id === selectedTeamId ? 'free' : 'paid',
          },
        }))
      );
      setNotice('This is now your one free team. Your previous free team is read-only.');
    });
  }

  function handleLeaguePlan(planId) {
    return runAction(`league-${planId}`, async () => {
      let response;
      if (selectedLeagueUsesPortal && !isCreatingLeague) {
        if (selectedLeague?.billing?.plan === planId && !selectedLeague?.billing?.scheduledPlan) {
          response = await billingApi.createCustomerPortalSession({
            leagueId: selectedLeagueId,
          });
        } else {
          response = await billingApi.changeLeaguePlan(selectedLeagueId, planId);
        }
      } else {
        response = await billingApi.createLeagueCheckoutSession(
          planId,
          isCreatingLeague ? undefined : selectedLeagueId || undefined
        );
      }

      if (response?.scheduled) {
        setNotice(
          `Your change to League is scheduled for ${new Date(response.effectiveAt).toLocaleDateString()}.`
        );
        return;
      }
      if (response?.change === 'downgrade_canceled') {
        setNotice('Your scheduled downgrade was canceled. League Plus will continue.');
        return;
      }
      await followStripeResponse(response);
    });
  }

  const buttonClass =
    'w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <main className="space-y-10">
      <PageHeader
        eyebrow="Pricing"
        title="Teams track for free. Leagues pay to run the competition."
        description="Every team gets every tracking feature. Your first standalone team is free. Pay only when you manage another standalone team or organise a whole league."
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4" aria-label="Plans">
        <PlanCard
          title={plans.starter?.name || 'Your first team'}
          price={plans.starter?.price || 'Free'}
          description={plans.starter?.tagline || 'Manage one standalone team for free.'}
          features={plans.starter?.features}
        >
          {user ? (
            <Link to="/teams/new" className={buttonClass}>
              Create your free team
            </Link>
          ) : (
            <SignupLink source={SIGNUP_SOURCE.PRICING}>Create your free team</SignupLink>
          )}
        </PlanCard>

        <PlanCard
          title={plans.team_extra?.name || 'Additional team'}
          price={plans.team_extra?.intervals?.monthly?.display || '$5/month'}
          description={plans.team_extra?.tagline || 'For each standalone team after your first.'}
          features={plans.team_extra?.features}
        >
          {user ? (
            <>
              <ResourceSelect
                label="Choose a team"
                value={selectedTeamId}
                onChange={setSelectedTeamId}
                resources={teams}
                emptyLabel="Create a team first"
              />
              <button
                type="button"
                className={buttonClass}
                disabled={
                  !selectedTeamId || selectedTeamIsFree || isLoadingData || pendingAction !== ''
                }
                onClick={handleAdditionalTeam}
              >
                {pendingAction === 'team-checkout'
                  ? 'Redirecting…'
                  : selectedTeamIsFree
                    ? 'This team is already included'
                    : selectedTeamUsesPortal
                      ? 'Manage team billing'
                      : 'Subscribe for this team'}
              </button>
              {selectedTeam?.billing?.capacityType === 'paid' && !selectedTeamUsesPortal ? (
                <button
                  type="button"
                  className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
                  disabled={pendingAction !== ''}
                  onClick={handleChooseFreeTeam}
                >
                  {pendingAction === 'free-team' ? 'Saving…' : 'Make this my free team'}
                </button>
              ) : null}
            </>
          ) : (
            <SignupLink source={SIGNUP_SOURCE.PRICING}>Get started</SignupLink>
          )}
        </PlanCard>

        {['league', 'league_plus'].map((planId) => {
          const plan = plans[planId];
          const isCurrentPlan = selectedLeague?.billing?.plan === planId;
          const cancelsScheduledChange =
            isCurrentPlan && Boolean(selectedLeague?.billing?.scheduledPlan);
          return (
            <PlanCard
              key={planId}
              title={plan?.name || (planId === 'league' ? 'League' : 'League Plus')}
              price={
                plan?.intervals?.monthly?.display ||
                (planId === 'league' ? '$29/month' : '$49/month')
              }
              trial="14-day free trial · card required"
              description={
                plan?.tagline || (planId === 'league' ? 'For up to 10 teams.' : 'For 11–24 teams.')
              }
              features={plan?.features}
              accent={planId === 'league'}
            >
              {user ? (
                <>
                  <ResourceSelect
                    label="Choose a league"
                    value={selectedLeagueId}
                    onChange={setSelectedLeagueId}
                    resources={leagues}
                    emptyLabel="Create a league after checkout"
                  />
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={
                      isLoadingData ||
                      pendingAction !== '' ||
                      (selectedLeagueIsComplimentary && !isCreatingLeague)
                    }
                    onClick={() => handleLeaguePlan(planId)}
                  >
                    {selectedLeagueIsComplimentary && !isCreatingLeague
                      ? 'Complimentary League'
                      : pendingAction === `league-${planId}`
                        ? 'Redirecting…'
                        : cancelsScheduledChange
                          ? `Keep ${planId === 'league' ? 'League' : 'League Plus'}`
                          : isCurrentPlan && selectedLeagueUsesPortal && !isCreatingLeague
                            ? 'Manage billing'
                            : selectedLeagueUsesPortal && !isCreatingLeague
                              ? `Change to ${planId === 'league' ? 'League' : 'League Plus'}`
                              : 'Start 14-day trial'}
                  </button>
                </>
              ) : (
                <SignupLink source={SIGNUP_SOURCE.PRICING}>Start 14-day trial</SignupLink>
              )}
            </PlanCard>
          );
        })}
      </section>

      <p className="text-sm text-slate-600">
        Need more than 24 teams in one league?{' '}
        <Link to="/contact" className="font-semibold text-violet-700">
          Contact us
        </Link>
        . Cancelling keeps your data; paid team or league management becomes read-only when the paid
        period ends.
      </p>
    </main>
  );
}
