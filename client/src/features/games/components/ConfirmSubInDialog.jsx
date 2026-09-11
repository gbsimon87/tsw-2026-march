import { useEffect, useState } from 'react';
import { SUB_OUT_REQUIRED_MESSAGE, SubOutSelect } from './SubOutSelect';

// Voice recovery for a roster player who is sitting on the bench. Unlike AddRosterPlayerDialog
// there is nobody to create — the player already exists, so this only confirms the substitution
// that has to happen before the stat the command already captured can be recorded against them.
export function ConfirmSubInDialog({
  isOpen,
  onClose,
  onConfirm,
  playerLabel,
  teamName,
  statLabel,
  playersToSubOut = [],
  requirePlayerOut = false,
}) {
  const [selectedPlayerOutId, setSelectedPlayerOutId] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedPlayerOutId('');
      setError('');
      setIsSaving(false);
    }
  }, [isOpen, playerLabel]);

  if (!isOpen) return null;

  async function handleSubmit(event) {
    event.preventDefault();

    if (requirePlayerOut && !selectedPlayerOutId) {
      setError(SUB_OUT_REQUIRED_MESSAGE);
      return;
    }

    setError('');
    setIsSaving(true);
    try {
      await onConfirm({ playerOutId: requirePlayerOut ? selectedPlayerOutId : null });
    } catch (submitError) {
      // Surface the server's real message — a generic string here is the exact
      // swallowed-error pattern PROJECT-KNOWLEDGE §11 flags as recurring debt.
      setError(submitError.message || 'Failed to sub the player in');
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sub in a player from the bench"
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
      >
        <h2 className="text-base font-semibold text-slate-900">Player is on the bench</h2>
        {teamName ? <p className="mt-0.5 text-sm text-slate-500">{teamName}</p> : null}
        <p className="mt-2 text-sm text-slate-600">
          {playerLabel} is not on the court. Sub them in and record the captured {statLabel}?
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <SubOutSelect
            value={selectedPlayerOutId}
            onChange={setSelectedPlayerOutId}
            players={playersToSubOut}
            required={requirePlayerOut}
          />

          {error ? (
            <p role="alert" className="text-sm text-rose-600">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              {isSaving ? 'Subbing in...' : 'Sub in & record stat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
