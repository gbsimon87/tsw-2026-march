import { Link } from 'react-router-dom';

export function LockedFeatureCard({ planName = 'Team', pricingHref = '/pricing', children }) {
  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div
        className="pointer-events-none select-none"
        style={{ filter: 'blur(4px)', userSelect: 'none' }}
        aria-hidden="true"
      >
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/60">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-center shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {planName} feature
          </p>
          <p className="mt-2 text-sm font-medium text-slate-800">
            Upgrade to the {planName} plan to unlock this.
          </p>
          <Link
            to={pricingHref}
            className="mt-3 inline-block rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
          >
            View Pricing
          </Link>
        </div>
      </div>
    </div>
  );
}
