import { Link } from 'react-router-dom';

export function LockedFeatureCard({ title, description, showUpgrade = false }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-5 text-sm text-slate-700">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Team Pro</p>
      <h3 className="mt-2 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2">{description}</p>
      {showUpgrade ? (
        <Link
          to="/pricing"
          className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Upgrade to Team Pro
        </Link>
      ) : null}
    </div>
  );
}
