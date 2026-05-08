export function JoinRequestsPanel({
  requests = [],
  canReview = false,
  onApprove,
  onReject,
  onCancel,
}) {
  if (!requests.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        No join requests yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((request) => {
        const requestedPlayerLabel =
          request.requestedPlayerName && request.requestedPlayerJerseyNumber != null
            ? `#${request.requestedPlayerJerseyNumber} ${request.requestedPlayerName}`
            : request.requestedPlayerName;

        return (
          <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">{request.requesterName || 'User'}</p>
                <p className="text-xs text-slate-500">
                  Requested role: {request.requestedRole} • Status: {request.status}
                </p>
                {request.requestedRole === 'player' ? (
                  <p className="mt-1 text-xs text-slate-600">
                    Requested player slot:{' '}
                    <span className="font-semibold text-slate-800">
                      {requestedPlayerLabel || 'Unknown player'}
                    </span>
                  </p>
                ) : null}
              </div>
              {request.status === 'pending' ? (
                <div className="flex flex-wrap gap-2">
                  {canReview ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onApprove?.(request.id)}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => onReject?.(request.id)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onCancel?.(request.id)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
