import { useEffect, useRef, useState } from 'react';

/**
 * Confirms that something the user just did actually worked.
 *
 * Creating a team used to produce no confirmation at all — the app simply
 * navigated somewhere else and left the user to infer the result.
 *
 * The check draws itself in (transitions-dev "success check": fade + rotate +
 * Y-bob + stroke draw), which is the one authored motion moment on arrival.
 */
export function SuccessBanner({ headline, body, onDismiss }) {
  const pathRef = useRef(null);
  const [pathLength, setPathLength] = useState(null);

  // The snippet ships a placeholder dasharray; the real length has to come from
  // this path or the stroke either pre-reveals or over-draws.
  useEffect(() => {
    const node = pathRef.current;
    if (!node?.getTotalLength) return;
    setPathLength(Math.ceil(node.getTotalLength()) + 1);
  }, []);

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
    >
      <span
        className="t-success-check inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1B4332] text-white"
        style={pathLength ? { '--check-path-length': pathLength } : undefined}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
          <path
            ref={pathRef}
            className="t-success-check-path"
            d="M6 12.5 10 16.5 18 8"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[#1B4332]">{headline}</p>
        {body ? <p className="mt-0.5 text-sm text-emerald-800">{body}</p> : null}
      </div>

      {onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="-m-1 shrink-0 rounded-full p-1 text-emerald-700 transition-colors hover:bg-emerald-100 hover:text-[#1B4332]"
        >
          <svg
            viewBox="0 0 20 20"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m5 5 10 10" strokeLinecap="round" />
            <path d="M15 5 5 15" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
