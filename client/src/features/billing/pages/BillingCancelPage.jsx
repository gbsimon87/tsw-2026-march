import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';

export function BillingCancelPage() {
  const [searchParams] = useSearchParams();
  const resourceType = searchParams.get('resourceType');
  const teamId = searchParams.get('teamId');
  const pricingHref = teamId ? `/pricing?teamId=${encodeURIComponent(teamId)}` : '/pricing';

  let title = 'Checkout was cancelled. No changes were made.';
  let description = 'You can return to pricing any time and restart checkout.';

  if (resourceType === 'team') {
    title = 'Your team is still on the free plan.';
    description = 'No billing changes were applied. Return to pricing to start a free trial.';
  } else if (resourceType === 'league') {
    title = 'Your league plan checkout was cancelled.';
    description = 'No changes were made. Return to pricing to start a league free trial.';
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Checkout Canceled" title={title} description={description} />

      <div className="flex flex-wrap gap-3">
        <Link
          to={pricingHref}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Return to Pricing
        </Link>
        <Link
          to="/dashboard"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
        >
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}
