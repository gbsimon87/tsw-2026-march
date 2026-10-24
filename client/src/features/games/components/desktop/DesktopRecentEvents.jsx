const icons = {
  edit: <path d="M11 2.5a1.5 1.5 0 0 1 2.121 2.121L5 12.75l-3 .75.75-3L11 2.5Z" />,
  insert: (
    <>
      <path d="M8 3v8M5 8l3 3 3-3" />
      <path d="M3 13h10" />
    </>
  ),
  delete: <path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5l.5-9" />,
};
function EventIcon({ name }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      {icons[name]}
    </svg>
  );
}
export function DesktopRecentEvents({
  events,
  describeEvent,
  disabled,
  undoDisabled,
  onUndo,
  onEdit,
  onInsert,
  onDelete,
  onViewAll,
}) {
  return (
    <section aria-label="Recent plays" className="border-t border-slate-200 pt-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <h2 className="font-bold">Recent plays</h2>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={undoDisabled || !events.length}
            onClick={onUndo}
            aria-label={
              events.length
                ? `Undo ${describeEvent(events[0]).actor} ${describeEvent(events[0]).statLabel || 'event'}`
                : 'Undo last event'
            }
            className="font-semibold text-emerald-900 disabled:opacity-50"
          >
            Undo
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onViewAll}
            className="font-semibold text-emerald-900 disabled:opacity-50"
          >
            All events
          </button>
        </div>
      </div>
      <div
        className="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-500"
        aria-label="Event actions legend"
      >
        {[
          ['edit', 'Edit'],
          ['insert', 'Insert before'],
          ['delete', 'Delete'],
        ].map(([name, label]) => (
          <span key={name} className="flex items-center gap-1">
            <EventIcon name={name} />
            {label}
          </span>
        ))}
      </div>
      <div className="mt-1 divide-y divide-slate-100">
        {events.slice(0, 1).map((event) => {
          const parts = describeEvent(event);
          return (
            <div key={event.id} className="flex items-center justify-between gap-2 py-1.5">
              <div className="min-w-0 text-xs">
                <p className="truncate font-semibold" title={`${parts.actor} · ${parts.statLabel}`}>
                  {parts.actor} · {parts.statLabel}
                </p>
                <p className="truncate text-[10px] text-slate-500">{parts.meta}</p>
              </div>
              <div className="flex shrink-0 gap-0.5">
                {[
                  ['edit', 'Edit event', () => onEdit(event), disabled],
                  [
                    'insert',
                    'Insert before',
                    () => onInsert(event),
                    disabled || event.statType.startsWith('SUB_'),
                  ],
                  ['delete', 'Delete event', () => onDelete(event.id), disabled],
                ].map(([name, label, action, locked]) => (
                  <button
                    key={name}
                    type="button"
                    disabled={locked}
                    aria-label={`${label}: ${parts.actor} ${parts.statLabel}`}
                    title={label}
                    onClick={action}
                    className={`rounded p-2 hover:bg-slate-100 focus-visible:outline-emerald-700 disabled:opacity-50 ${name === 'delete' ? 'text-red-700' : 'text-slate-500'}`}
                  >
                    <EventIcon name={name} />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {!events.length && (
        <p className="py-2 text-xs text-slate-500">Recorded plays will appear here.</p>
      )}
    </section>
  );
}
