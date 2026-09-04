import { useId } from 'react';

const baseInputClass =
  'w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2';

const restingClass = 'border-slate-200 focus:border-[#F4A300]/60 focus:ring-[#F4A300]/20';

// An invalid field has to be identifiable without colour alone, so the border
// thickens as well as reddening.
const invalidClass = 'border-2 border-red-400 focus:border-red-500 focus:ring-red-200';

/**
 * One labelled input with its hint, its error, and the wiring that makes a
 * screen reader read all three: `aria-invalid` plus `aria-describedby`
 * pointing at whichever of hint/error is present.
 */
export function FormField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  error = '',
  hint = '',
  required = false,
  autoComplete,
  inputMode,
  placeholder,
}) {
  const generatedId = useId();
  const inputId = `${generatedId}-${name}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
          {label}
        </label>
        {required ? null : <span className="text-xs text-slate-400">Optional</span>}
      </div>

      <input
        id={inputId}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy || undefined}
        className={`${baseInputClass} ${error ? invalidClass : restingClass}`}
      />

      {error ? (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
