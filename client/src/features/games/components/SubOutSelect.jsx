import { useId } from 'react';

// Shared by both voice recovery dialogs: bringing a player on when the lineup is already full
// means somebody has to come off, and both dialogs ask that question identically. When the lineup
// has room there is nothing to ask, so the component says so rather than rendering an empty select.
export function SubOutSelect({ value, onChange, players = [], required = false }) {
  const selectId = useId();

  if (!required) {
    return (
      <p className="text-xs text-slate-500">The lineup has room, so nobody has to come off.</p>
    );
  }

  return (
    <div>
      <label htmlFor={selectId} className="block text-sm font-medium text-slate-700">
        Sub out
      </label>
      <select
        id={selectId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
      >
        <option value="">Choose an on-court player</option>
        {players.map((player) => (
          <option key={player.id} value={player.id}>
            {player.jerseyNumber != null ? `#${player.jerseyNumber} ` : ''}
            {player.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}

// The one place the "who comes off" rule is enforced in a dialog, so both dialogs fail the same
// way with the same wording. GameTrackPage re-checks it against the captured lineup before writing.
export const SUB_OUT_REQUIRED_MESSAGE = 'Choose which on-court player is being subbed out';
