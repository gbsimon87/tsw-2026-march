import { useEffect, useRef, useState } from 'react';

// Social backlog rank 4. Generated copy is only useful if it reaches the
// clipboard in one click — an operator who has to retype it has saved nothing.
const FEEDBACK_MS = 2000;

const COPY_LABELS = {
  idle: 'Copy',
  copied: 'Copied',
  failed: 'Copy failed',
  // A non-secure origin (plain http, which is every local dev server) exposes no
  // clipboard API at all. Say so rather than leaving a dead button.
  unsupported: 'Select and copy',
};

export function CopyButton({ value, label, disabled = false }) {
  const [state, setState] = useState('idle');
  const timer = useRef(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    window.clearTimeout(timer.current);
    if (!navigator?.clipboard?.writeText) {
      setState('unsupported');
    } else {
      try {
        await navigator.clipboard.writeText(value);
        setState('copied');
      } catch {
        setState('failed');
      }
    }
    timer.current = window.setTimeout(() => setState('idle'), FEEDBACK_MS);
  }

  return (
    <button
      type="button"
      onClick={copy}
      disabled={disabled || !value}
      aria-label={`Copy ${label}`}
      className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
        state === 'copied'
          ? 'border-green-300 bg-green-50 text-green-800'
          : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
      }`}
    >
      {COPY_LABELS[state]}
    </button>
  );
}
