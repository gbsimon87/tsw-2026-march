const SEVERITY_STYLES = {
  high: 'bg-rose-50 text-rose-700 ring-rose-200',
  medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  low: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const SEVERITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low' };

function SeverityBadge({ severity }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
        SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.low
      }`}
    >
      {SEVERITY_LABELS[severity] ?? 'Low'}
    </span>
  );
}

function IssueRow({ item, canDismiss, onDismiss, onRestore }) {
  return (
    <li className="flex flex-col gap-2 border-t border-slate-100 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <a
          href={item.href}
          className="text-sm font-medium text-sky-700 hover:text-sky-900 hover:underline"
        >
          {item.label}
        </a>
        <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>
      </div>
      {canDismiss ? (
        <button
          type="button"
          onClick={() => (item.dismissed ? onRestore(item.issueKey) : onDismiss(item.issueKey))}
          className="shrink-0 self-start rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 sm:self-auto"
        >
          {item.dismissed ? `Restore ${item.label}` : `Dismiss ${item.label}`}
        </button>
      ) : null}
    </li>
  );
}

function Category({ category, canDismiss, onDismiss, onRestore }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{category.label}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{category.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SeverityBadge severity={category.severity} />
          <span className="text-sm font-semibold text-slate-700">{category.items.length}</span>
        </div>
      </div>
      <ul className="mt-2">
        {category.items.map((item) => (
          <IssueRow
            key={item.issueKey}
            item={item}
            canDismiss={canDismiss}
            onDismiss={onDismiss}
            onRestore={onRestore}
          />
        ))}
      </ul>
    </section>
  );
}

export function DataCompletenessPanel({
  report,
  isLoading,
  error,
  canDismiss,
  onDismiss,
  onRestore,
}) {
  if (isLoading) {
    return <p className="py-8 text-center text-sm text-slate-500">Checking league data…</p>;
  }

  if (error) {
    return (
      <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
        {error}
      </p>
    );
  }

  if (!report) return null;

  if (!report.seasonId) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        This league has no active season, so there is nothing to check yet.
      </p>
    );
  }

  // A clean league should feel reassuring, not blank.
  if (report.categories.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm font-medium text-slate-900">Everything looks complete</p>
        <p className="mt-1 text-xs text-slate-500">No data gaps found in {report.seasonName}.</p>
      </div>
    );
  }

  // Split item-level, not category-level: a mixed category (some items
  // dismissed, some not) must show its active items in the main list AND its
  // dismissed items in the drawer — never both, never neither.
  const activeCategories = report.categories
    .map((category) => ({ ...category, items: category.items.filter((item) => !item.dismissed) }))
    .filter((category) => category.items.length > 0);
  const dismissedCategories = report.categories
    .map((category) => ({ ...category, items: category.items.filter((item) => item.dismissed) }))
    .filter((category) => category.items.length > 0);
  const dismissedCount = dismissedCategories.reduce(
    (total, category) => total + category.items.length,
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span>
          <span className="font-semibold text-slate-900">{report.counts.high}</span> high
        </span>
        <span>
          <span className="font-semibold text-slate-900">{report.counts.medium}</span> medium
        </span>
        <span>
          <span className="font-semibold text-slate-900">{report.counts.low}</span> low
        </span>
        <span className="text-slate-400">·</span>
        <span>{report.seasonName}</span>
      </div>

      {activeCategories.map((category) => (
        <Category
          key={category.key}
          category={category}
          canDismiss={canDismiss}
          onDismiss={onDismiss}
          onRestore={onRestore}
        />
      ))}

      {dismissedCount > 0 ? (
        <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Dismissed ({dismissedCount})
          </summary>
          <div className="mt-3 space-y-3">
            {dismissedCategories.map((category) => (
              <Category
                key={category.key}
                category={category}
                canDismiss={canDismiss}
                onDismiss={onDismiss}
                onRestore={onRestore}
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
