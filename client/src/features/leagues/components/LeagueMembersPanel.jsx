export function LeagueMembersPanel({ members = [], onRemove }) {
  if (!members.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        No team members yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {members.map((member) => (
        <article key={member.id} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">{member.userName || member.userEmail}</p>
              <p className="text-xs text-slate-500">
                {member.role} • {member.userEmail || 'No email'}
              </p>
            </div>
            {onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(member.id)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
              >
                Remove
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
