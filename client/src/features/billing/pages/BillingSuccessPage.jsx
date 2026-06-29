import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { teamsApi } from '../../teams/api/teamsApi';
import { leaguesApi } from '../../leagues/api/leaguesApi';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const MAX_POLL_ATTEMPTS = 5;
const POLL_DELAY_MS = 1500;

function isActivePlan(billing, planValues) {
  return planValues.includes(billing?.plan) && ACTIVE_STATUSES.has(billing?.subscriptionStatus);
}

export function BillingSuccessPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('checking');
  const [error, setError] = useState('');
  const [resourceName, setResourceName] = useState('');
  const [attemptCount, setAttemptCount] = useState(0);
  const [trialEnd, setTrialEnd] = useState(null);

  const resourceType = searchParams.get('resourceType') || 'team';
  const teamId = searchParams.get('teamId') || '';
  const leagueSetup = searchParams.get('leagueSetup') === '1';

  const isLeague = resourceType === 'league';
  const targetLabel = resourceName || (isLeague ? 'your league' : 'your team');

  useEffect(() => {
    let isActive = true;
    let timeoutId;

    async function pollTeam(nextAttempt = 1) {
      try {
        const response = await teamsApi.list();
        if (!isActive) return;

        const team = (response.teams || []).find((t) => t.id === teamId);
        if (!team) {
          setStatus('pending');
          return;
        }

        setResourceName(team.name);
        setAttemptCount(nextAttempt);

        if (isActivePlan(team.billing, ['team', 'pro'])) {
          setTrialEnd(team.billing?.trialEnd ?? null);
          setStatus('active');
          return;
        }

        const sub = team.billing?.subscriptionStatus || 'inactive';
        if (sub === 'past_due' || sub === 'canceled') {
          setStatus('attention');
          return;
        }

        if (nextAttempt >= MAX_POLL_ATTEMPTS) {
          setStatus('pending');
          return;
        }

        timeoutId = window.setTimeout(() => pollTeam(nextAttempt + 1), POLL_DELAY_MS);
      } catch (err) {
        if (!isActive) return;
        setError(err.message || 'Failed to refresh billing status');
        setStatus('error');
      }
    }

    async function pollLeague(nextAttempt = 1) {
      try {
        const response = await leaguesApi.list();
        if (!isActive) return;

        const leagues = response.leagues || response || [];
        const active = leagues.find((l) => isActivePlan(l.billing, ['league', 'pro']));

        setAttemptCount(nextAttempt);

        if (active) {
          setResourceName(active.name && active.name !== 'My League' ? active.name : '');
          setTrialEnd(active.billing?.trialEnd ?? null);
          setStatus('active');
          return;
        }

        if (nextAttempt >= MAX_POLL_ATTEMPTS) {
          setStatus('pending');
          return;
        }

        timeoutId = window.setTimeout(() => pollLeague(nextAttempt + 1), POLL_DELAY_MS);
      } catch (err) {
        if (!isActive) return;
        setError(err.message || 'Failed to refresh billing status');
        setStatus('error');
      }
    }

    if (isLeague) {
      pollLeague();
    } else if (teamId) {
      pollTeam();
    } else {
      setStatus('pending');
    }

    return () => {
      isActive = false;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [teamId, isLeague]);

  const trialEndLabel = useMemo(() => {
    if (!trialEnd) return null;
    try {
      return new Date(trialEnd).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return null;
    }
  }, [trialEnd]);

  const body = useMemo(() => {
    const planLabel = isLeague ? 'League plan' : 'Team plan';

    if (status === 'active') {
      const trialNote = trialEndLabel
        ? `14-day trial started. You won't be charged until ${trialEndLabel}.`
        : null;

      if (isLeague && leagueSetup) {
        return {
          eyebrow: 'Billing Active',
          title: "Your league plan is active. Let's set up your league.",
          description: trialNote || `${planLabel} confirmed. Configure your league details below.`,
          cta: { label: 'Set up your league', to: '/admin/leagues/new' },
        };
      }

      return {
        eyebrow: 'Billing Updated',
        title: `${targetLabel} is now on the ${planLabel}`,
        description: trialNote || 'Stripe checkout completed and billing is now active.',
      };
    }

    if (status === 'attention') {
      return {
        eyebrow: 'Billing Needs Attention',
        title: `Checkout finished, but ${targetLabel} still needs a billing review`,
        description:
          'The subscription did not settle into an active state. Open billing management to review.',
      };
    }

    if (status === 'error') {
      return {
        eyebrow: 'Billing Refresh Failed',
        title: 'Could not confirm access yet',
        description:
          error || 'The app could not refresh billing state. Try pricing again or reload shortly.',
      };
    }

    return {
      eyebrow: 'Billing Updating',
      title: `${planLabel} is still being finalized`,
      description: 'Stripe checkout completed. The app is checking whether billing is active.',
    };
  }, [status, isLeague, leagueSetup, targetLabel, trialEndLabel, error]);

  const pricingHref = teamId ? `/pricing?teamId=${encodeURIComponent(teamId)}` : '/pricing';

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow={body.eyebrow} title={body.title} description={body.description}>
        {(status === 'checking' || status === 'pending') && (
          <p className="text-sm text-slate-500">Refresh attempts: {attemptCount}</p>
        )}
      </PageHeader>

      <div className="flex flex-wrap gap-3">
        {body.cta ? (
          <Link
            to={body.cta.to}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            {body.cta.label}
          </Link>
        ) : (
          <Link
            to={pricingHref}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Back to Pricing
          </Link>
        )}
        <Link
          to="/dashboard"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Go to Dashboard
        </Link>
      </div>
    </main>
  );
}
