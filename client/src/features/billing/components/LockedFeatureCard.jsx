export function LockedFeatureCard({ title, description }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-5 text-sm text-slate-700">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Availability</p>
      <h3 className="mt-2 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2">{description}</p>
    </div>
  );
}
