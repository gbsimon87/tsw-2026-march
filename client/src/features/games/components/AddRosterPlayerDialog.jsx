import { useEffect, useId, useState } from 'react';
import { SUB_OUT_REQUIRED_MESSAGE, SubOutSelect } from './SubOutSelect';

// Mid-game roster add. Name + optional jersey only: this form gets filled with a
// game running, and jersey number is the field whose absence is immediately
// visible in the tracking UI's jersey badges. Position is omitted (unused by
// tracking, fixable later on the admin roster page).
export function AddRosterPlayerDialog({
  isOpen,
  onClose,
  onSubmit,
  teamName,
  title = 'Add Player',
  description = '',
  initialJerseyNumber = null,
  lockJerseyNumber = false,
  submitLabel = 'Add Player',
  playersToSubOut = [],
  requirePlayerOut = false,
}) {
  const nameId = useId();
  const jerseyId = useId();
  const headingId = useId();
  const [displayName, setDisplayName] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [selectedPlayerOutId, setSelectedPlayerOutId] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDisplayName('');
      setJerseyNumber(initialJerseyNumber == null ? '' : String(initialJerseyNumber));
      setSelectedPlayerOutId('');
      setError('');
      setIsSaving(false);
    }
  }, [initialJerseyNumber, isOpen]);

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
    if (parsedJersey !== null && (parsedJersey < 0 || parsedJersey > 999)) {
      setError('Jersey number must be between 0 and 999');
      return;
    }
    if (requirePlayerOut && !selectedPlayerOutId) {
      setError(SUB_OUT_REQUIRED_MESSAGE);
      return;
    }

    setError('');
    setIsSaving(true);
    try {
      await onSubmit({
        displayName: trimmed,
        jerseyNumber: parsedJersey,
        ...(requirePlayerOut ? { playerOutId: selectedPlayerOutId } : {}),
      });
    } catch (submitError) {
      // Surface the server's real message — a generic string here is the exact
      // swallowed-error pattern PROJECT-KNOWLEDGE §11 flags as recurring debt.
      setError(submitError?.message || 'Could not add the player');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    // z-[70] clears the fullscreen tracking overlay (z-50), which renders after this dialog and
    // would otherwise paint over it, wedging the tracker with voice disabled and scroll locked.
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
      >
        <h2 id={headingId} className="text-base font-semibold text-slate-900">
          {title}
        </h2>
        {teamName ? <p className="mt-0.5 text-sm text-slate-500">{teamName}</p> : null}
        {description ? <p className="mt-2 text-sm text-slate-600">{description}</p> : null}

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

          {requirePlayerOut ? (
            <SubOutSelect
              value={selectedPlayerOutId}
              onChange={setSelectedPlayerOutId}
              players={playersToSubOut}
              required
            />
          ) : null}

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
              disabled={lockJerseyNumber}
              value={jerseyNumber}
              onChange={(event) => setJerseyNumber(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-600"
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
              {isSaving ? 'Adding...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
