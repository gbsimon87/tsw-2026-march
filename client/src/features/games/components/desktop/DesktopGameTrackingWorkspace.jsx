export function DesktopGameTrackingWorkspace({
  activePanel,
  onNavigate,
  locked,
  children,
  quickStats,
  recentEvents,
  status,
  paused,
}) {
  return (
    <aside
      aria-label="League tracking workspace"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="shrink-0 space-y-3 border-b border-slate-200 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Game tracking
          </span>
          <span role="status" className="text-xs font-medium text-slate-600">
            {status}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1" aria-label="Tracking sections">
          {[
            [
              'court',
              'Court',
              <>
                <rect x="2" y="2" width="12" height="12" rx="1.5" />
                <path d="M8 2v12M2 8h12" />
              </>,
            ],
            [
              'substitutions',
              'Subs',
              <>
                <path d="M3 5h10M11 3l2 2-2 2" />
                <path d="M13 11H3M5 9l-2 2 2 2" />
              </>,
            ],
            ['events', 'Events', <path key="events" d="M3 4h10M3 8h7M3 12h5" />],
            [
              'options',
              'Options',
              <>
                <path d="M2 4h12M2 8h12M2 12h12" />
                <circle cx="5" cy="4" r="1.5" fill="white" />
                <circle cx="11" cy="8" r="1.5" fill="white" />
                <circle cx="6" cy="12" r="1.5" fill="white" />
              </>,
            ],
          ].map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              disabled={locked}
              aria-pressed={activePanel === id}
              onClick={() => onNavigate(id)}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold focus-visible:outline-emerald-700 disabled:opacity-50 ${activePanel === id ? 'bg-[#141414] text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                {icon}
              </svg>
              {label}
            </button>
          ))}
        </div>
        {locked && <p className="text-xs text-slate-500">Finish or cancel this entry first.</p>}
        {paused && <p className="text-xs font-semibold text-emerald-800">Paused for entry</p>}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="text-slate-900">{children}</div>
        {quickStats}
        {recentEvents}
      </div>
    </aside>
  );
}
