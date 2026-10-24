import { FOUL_TYPES } from '../foulStats';

export function FoulTypeChoices({ onSelect, disabled }) {
  return (
    <div role="group" aria-label="Foul type" className="grid grid-cols-3 gap-2">
      {FOUL_TYPES.map(({ type, label }) => (
        <button
          key={type}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(type)}
          className="min-h-12 rounded-lg border border-amber-200 bg-amber-50 px-2 py-3 text-sm font-semibold text-amber-950 transition hover:border-amber-400 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
