import { Link } from 'react-router-dom';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function PlayerMilestones({ milestones = [], total = 0 }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <header className="flex items-end justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1B4332]">
            Achievements
          </p>
          <h2
            className="mt-1 text-xl text-slate-900"
            style={{ fontFamily: "'Archivo Black', sans-serif" }}
          >
            Milestones
          </h2>
        </div>
        {total > milestones.length ? (
          <p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
            {total} total
          </p>
        ) : null}
      </header>

      {milestones.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No milestones yet. They appear here as this player hits career landmarks.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {milestones.map((milestone) => (
            <li
              key={milestone.id}
              className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3"
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F4A300] text-sm font-black text-[#141414]"
              >
                ★
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">
                {milestone.label}
              </span>
              {milestone.gameUrl ? (
                <Link
                  to={milestone.gameUrl}
                  className="shrink-0 text-xs font-medium text-slate-500 transition hover:text-[#1B4332] hover:underline"
                >
                  {formatDate(milestone.achievedAt)}
                </Link>
              ) : (
                <span className="shrink-0 text-xs text-slate-500">
                  {formatDate(milestone.achievedAt)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
