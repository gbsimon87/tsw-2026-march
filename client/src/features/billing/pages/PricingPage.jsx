import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/store/AuthContext';
import { billingApi } from '../api/billingApi';
import { teamsApi } from '../../teams/api/teamsApi';

const FREE_FEATURES = [
  'Team and roster setup',
  'Live game tracking',
  'Basic box score',
  'Public team and player pages',
  'Explore feed visibility',
];

const PRO_FEATURES = ['Replay experience', 'Public game shot maps', 'Priority billing support'];

function PlanCard({ title, price, description, features, children, accent = 'slate' }) {
  const accentStyles =
    accent === 'amber'
      ? 'border-amber-300 bg-gradient-to-b from-amber-50 via-white to-white'
      : 'border-slate-200 bg-white';

  return (
    <article className={`rounded-3xl border p-6 shadow-sm ${accentStyles}`}>
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-3 text-4xl font-bold text-slate-900">{price}</p>
      <p className="mt-3 text-sm text-slate-600">{description}</p>
      <ul className="mt-5 space-y-2 text-sm text-slate-700">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <span aria-hidden="true" className="text-emerald-600">
              ✓
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6">{children}</div>
    </article>
  );
}

export function PricingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      setTeams([]);
      setSelectedTeamId('');
      return;
    }

    setIsLoadingTeams(true);
    teamsApi
      .list()
      .then((response) => {
        const nextTeams = response.teams || [];
        setTeams(nextTeams);
        setSelectedTeamId((current) => current || nextTeams[0]?.id || '');
      })
      .catch((loadError) => setError(loadError.message || 'Failed to load teams'))
      .finally(() => setIsLoadingTeams(false));
  }, [user]);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) || null,
    [selectedTeamId, teams]
  );

  async function handleProCheckout() {
    setError('');

    if (!user) {
      navigate('/login?redirectTo=/pricing');
      return;
    }

    if (!teams.length) {
      navigate('/teams/new?redirectTo=/pricing');
      return;
    }

    if (!selectedTeamId) {
      setError('Select a team to upgrade.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (selectedTeam?.billing?.plan === 'pro') {
        const portal = await billingApi.createCustomerPortalSession(selectedTeamId);
        if (!portal.url) {
          throw new Error('Billing portal URL missing');
        }
        window.location.assign(portal.url);
        return;
      }

      const response = await billingApi.createCheckoutSession(selectedTeamId);
      if (!response.url) {
        throw new Error('Checkout URL missing');
      }
      window.location.assign(response.url);
    } catch (submitError) {
      setError(submitError.message || 'Failed to start checkout');
      setIsSubmitting(false);
    }
  }

  function handleFreePlan() {
    if (!user) {
      navigate('/register?redirectTo=/teams/new');
      return;
    }

    navigate(teams.length > 0 ? '/dashboard' : '/teams/new');
  }

  return (
    <main className="space-y-10">
      <section className="rounded-3xl bg-gradient-to-r from-amber-50 via-white to-sky-50 p-8 md:p-12">
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Pricing</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight text-slate-900 md:text-5xl">
          Start free, then unlock richer review for each team when it matters.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-700 md:text-lg">
          Billing is per team. Free keeps tracking open. Team Pro adds replay and shot-map review.
        </p>
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <PlanCard
          title="Free"
          price="$0"
          description="Use the full tracking workflow without a billing setup."
          features={FREE_FEATURES}
        >
          <button
            type="button"
            onClick={handleFreePlan}
            className="w-full rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
          >
            {user ? (teams.length > 0 ? 'Continue with Free' : 'Create Your Team') : 'Start Free'}
          </button>
        </PlanCard>

        <PlanCard
          title="Team Pro"
          price="$8/mo"
          description="Upgrade one team at a time to unlock premium post-game review."
          features={[...FREE_FEATURES, ...PRO_FEATURES]}
          accent="amber"
        >
          <div className="space-y-3">
            {user ? (
              teams.length > 0 ? (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Team to upgrade
                  </span>
                  <select
                    className="w-full rounded border border-slate-300 px-3 py-2"
                    value={selectedTeamId}
                    onChange={(event) => setSelectedTeamId(event.target.value)}
                    disabled={isLoadingTeams || isSubmitting}
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                        {team.billing?.plan === 'pro' ? ' (Already Pro)' : ''}
                      </option>
                    ))}
                  </select>
                  {selectedTeam ? (
                    <span className="mt-1 block text-xs text-slate-500">
                      Current plan: {selectedTeam.billing?.plan || 'free'}
                    </span>
                  ) : null}
                </label>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-3 text-sm text-slate-600">
                  Create a team first, then return here to start Team Pro checkout.
                </p>
              )
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-3 text-sm text-slate-600">
                Sign in first so the subscription can be attached to a team you own.
              </p>
            )}

            <button
              type="button"
              onClick={handleProCheckout}
              disabled={isSubmitting || isLoadingTeams}
              className="w-full rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {isSubmitting
                ? 'Redirecting to Stripe...'
                : selectedTeam?.billing?.plan === 'pro'
                  ? 'Manage Team Pro Billing'
                  : 'Choose Team Pro'}
            </button>

            {!user ? (
              <p className="text-xs text-slate-500">
                Already have an account?{' '}
                <Link
                  className="underline decoration-slate-300 underline-offset-4"
                  to="/login?redirectTo=/pricing"
                >
                  Log in
                </Link>
              </p>
            ) : null}
          </div>
        </PlanCard>
      </section>
    </main>
  );
}
