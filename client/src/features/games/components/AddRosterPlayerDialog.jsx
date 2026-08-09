import { useEffect, useId, useState } from 'react';

// Mid-game roster add. Name + optional jersey only: this form gets filled with a
// game running, and jersey number is the field whose absence is immediately
// visible in the tracking UI's jersey badges. Position is omitted (unused by
// tracking, fixable later on the admin roster page).
export function AddRosterPlayerDialog({ isOpen, onClose, onSubmit, teamName }) {
  const nameId = useId();
  const jerseyId = useId();
  const [displayName, setDisplayName] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDisplayName('');
      setJerseyNumber('');
      setError('');
      setIsSaving(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError('Player name is required');
      return;
    }

    const parsedJersey = jerseyNumber.trim() === '' ? null : Number(jerseyNumber);
    if (parsedJersey !== null && !Number.isInteger(parsedJersey)) {
      setError('Jersey number must be a whole number');
      return;
    }

    setError('');
    setIsSaving(true);
    try {
      await onSubmit({ displayName: trimmed, jerseyNumber: parsedJersey });
    } catch (submitError) {
      // Surface the server's real message — a generic string here is the exact
      // swallowed-error pattern PROJECT-KNOWLEDGE §11 flags as recurring debt.
      setError(submitError?.message || 'Could not add the player');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add player to roster"
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
      >
        <h2 className="text-base font-semibold text-slate-900">Add Player</h2>
        {teamName ? <p className="mt-0.5 text-sm text-slate-500">{teamName}</p> : null}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label htmlFor={nameId} className="block text-sm font-medium text-slate-700">
              Player name
            </label>
            <input
              id={nameId}
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={120}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- dialog opens via explicit user action; focusing the first field is expected here.
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor={jerseyId} className="block text-sm font-medium text-slate-700">
              Jersey number <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id={jerseyId}
              type="number"
              inputMode="numeric"
              min="0"
              max="999"
              value={jerseyNumber}
              onChange={(event) => setJerseyNumber(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              {isSaving ? 'Adding...' : 'Add Player'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
