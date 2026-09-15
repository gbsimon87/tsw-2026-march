import { EXPORT_CLEARANCE } from '../exportGuard';

// Social backlog rank 9. The one place an export surface says what the guard
// decided, so every surface says it the same way.
//
// A cleared card shows nothing: a banner on every successful export is a banner
// nobody reads by the second week, and the guard's whole value is that the two
// states that matter look different.
export function ExportGuardNotice({ guard, loading = false, className = '' }) {
  if (loading) {
    return (
      <p className={`text-xs text-slate-600 ${className}`} role="status">
        Checking marketing permission…
      </p>
    );
  }

  if (!guard || guard.clearance === EXPORT_CLEARANCE.CLEARED) return null;

  const blocked = guard.clearance === EXPORT_CLEARANCE.BLOCKED;
  const tone = blocked
    ? 'border-red-200 bg-red-50 text-red-900'
    : 'border-amber-200 bg-amber-50 text-amber-900';

  return (
    <div
      // A blocked export is the operator's next action; a partial mask is
      // information about what they are about to publish.
      role={blocked ? 'alert' : 'status'}
      className={`w-full rounded-xl border px-4 py-3 text-sm ${tone} ${className}`}
    >
      <p className="font-semibold">{guard.headline}</p>
      <p className="mt-1 text-xs leading-relaxed">{guard.detail}</p>
    </div>
  );
}
