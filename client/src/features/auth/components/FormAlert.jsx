/**
 * The form-level error banner.
 *
 * Two things it must do that the previous bare <p> did not:
 * - announce itself (`role="alert"`), so a screen-reader user learns the submit
 *   failed instead of sitting on an apparently idle form;
 * - reserve its own space, so appearing does not shove the whole form down.
 */
export function FormAlert({ message }) {
  return (
    <div aria-live="assertive" role="alert" className="min-h-[2.75rem]">
      {message ? (
        <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <svg
            viewBox="0 0 16 16"
            className="mt-0.5 h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 5v4" strokeLinecap="round" />
            <path d="M8 11h.01" strokeLinecap="round" />
          </svg>
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}
