export function DesktopEntryHeader({ title, eyebrow, actions, children }) {
  return (
    <header className="space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          {eyebrow && (
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-emerald-800">
              {eyebrow}
            </span>
          )}
          <h2 className="min-w-0 text-lg font-bold leading-snug">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
      {children}
    </header>
  );
}
