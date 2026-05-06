import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';

export function BillingCancelPage() {
  const [searchParams] = useSearchParams();
  const teamId = searchParams.get('teamId');
  const pricingHref = teamId ? `/pricing?teamId=${encodeURIComponent(teamId)}` : '/pricing';

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Checkout Canceled"
        title="Your team is still on Free"
        description="No billing changes were applied. You can return to pricing any time and restart checkout."
      />

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
