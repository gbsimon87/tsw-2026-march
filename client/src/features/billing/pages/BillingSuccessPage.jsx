import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { teamsApi } from '../../teams/api/teamsApi';

const ACTIVE_BILLING_STATUSES = new Set(['active', 'trialing']);
const MAX_POLL_ATTEMPTS = 5;
const POLL_DELAY_MS = 1500;

function isActiveProTeam(team) {
  return (
    team?.billing?.plan === 'pro' && ACTIVE_BILLING_STATUSES.has(team?.billing?.subscriptionStatus)
  );
}

export function BillingSuccessPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('checking');
  const [error, setError] = useState('');
  const [teamName, setTeamName] = useState('');
  const [attemptCount, setAttemptCount] = useState(0);

  const teamId = searchParams.get('teamId') || '';
  const targetTeamLabel = teamName || 'your team';

  useEffect(() => {
    let isActive = true;
    let timeoutId;

    async function loadBillingState(nextAttempt = 1) {
      if (!teamId) {
        if (isActive) {
          setStatus('pending');
        }
        return;
      }

      try {
        const response = await teamsApi.list();
        if (!isActive) {
          return;
        }

        const team = (response.teams || []).find((item) => item.id === teamId);
        if (!team) {
          setStatus('pending');
          return;
        }

        setTeamName(team.name);
        setAttemptCount(nextAttempt);

        if (isActiveProTeam(team)) {
          setStatus('active');
          setError('');
          return;
        }

        const subscriptionStatus = team.billing?.subscriptionStatus || 'inactive';
        if (subscriptionStatus === 'past_due' || subscriptionStatus === 'canceled') {
          setStatus('attention');
          return;
        }

        if (nextAttempt >= MAX_POLL_ATTEMPTS) {
          setStatus('pending');
          return;
        }

        timeoutId = window.setTimeout(() => {
          loadBillingState(nextAttempt + 1);
        }, POLL_DELAY_MS);
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setError(loadError.message || 'Failed to refresh billing status');
        setStatus('error');
      }
    }

    loadBillingState();

    return () => {
      isActive = false;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [teamId]);

  const body = useMemo(() => {
    if (status === 'active') {
      return {
        eyebrow: 'Billing Updated',
        title: `${targetTeamLabel} is now on Team Pro`,
        description:
          'Stripe checkout completed and the team billing status is active. Replay and public shot-map access should now follow the team entitlement state.',
      };
    }

    if (status === 'attention') {
      return {
        eyebrow: 'Billing Needs Attention',
        title: `Checkout finished, but ${targetTeamLabel} still needs a billing review`,
        description:
          'The team did not settle into an active Team Pro state. Open pricing or billing management to review the subscription status.',
      };
    }

    if (status === 'error') {
      return {
        eyebrow: 'Billing Refresh Failed',
        title: 'Could not confirm team access yet',
        description:
          error ||
          'The app could not refresh team billing state. Try pricing again or reload shortly.',
      };
    }

    return {
      eyebrow: 'Billing Updating',
      title: 'Team Pro is still being finalized',
      description: teamId
        ? `Stripe checkout completed. The app is checking whether ${targetTeamLabel} has received active Team Pro access.`
        : 'Stripe checkout completed. The app is waiting for billing state to finish syncing.',
    };
  }, [error, status, targetTeamLabel, teamId]);

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow={body.eyebrow} title={body.title} description={body.description}>
        {status === 'checking' || status === 'pending' ? (
          <p className="text-sm text-slate-500">
            Refresh attempts: {attemptCount}
            {teamId ? ` for team ${teamId}` : ''}
          </p>
        ) : null}
      </PageHeader>

      <div className="flex flex-wrap gap-3">
        <Link
          to={teamId ? `/pricing?teamId=${encodeURIComponent(teamId)}` : '/pricing'}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Back to Pricing
        </Link>
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
