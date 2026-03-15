import { Link } from 'react-router-dom';

export function BillingSuccessPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <section className="rounded-3xl bg-gradient-to-r from-emerald-50 via-white to-sky-50 p-8 md:p-10">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Billing Updated
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">
          Team Pro is on its way
        </h1>
        <p className="mt-3 text-slate-700">
          Your checkout completed successfully. Stripe webhooks will finalize team access in a
          moment.
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/pricing"
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
