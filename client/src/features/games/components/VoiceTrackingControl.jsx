import { useEffect, useRef } from 'react';
import { useSpeechRecognition } from '../voice/useSpeechRecognition';

export function VoiceTrackingControl({
  disabled = false,
  contextVersion = '',
  promptActive = false,
  courtTapOnly = false,
  startRequest = 0,
  onStartRequestHandled,
  onListeningStart,
  onCommand,
  onFailure,
  onBusyChange,
}) {
  const speech = useSpeechRecognition({
    disabled,
    contextVersion,
    onStart: onListeningStart,
    onResult: onCommand,
    onFailure,
  });
  const startSpeech = speech.start;
  const handledStartRequestRef = useRef(0);

  // A court tap commits its location first, then increments startRequest. Starting from this
  // effect means onStart sees the render containing that exact location, while the same control
  // stays mounted to display the whole recognition lifecycle.
  useEffect(() => {
    if (!startRequest) {
      handledStartRequestRef.current = 0;
      return;
    }
    if (handledStartRequestRef.current === startRequest) return;
    handledStartRequestRef.current = startRequest;
    startSpeech();
    // Clear the trigger in the parent after this mounted control consumes it. If responsive
    // layout changes remount the control during recognition, the replacement must not interpret
    // the old court tap as a new microphone request.
    onStartRequestHandled?.();
  }, [onStartRequestHandled, startRequest, startSpeech]);

  useEffect(() => {
    onBusyChange?.(speech.busy);
  }, [onBusyChange, speech.busy]);

  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  if (!speech.supported) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {speech.supportReason === 'insecure'
          ? 'Voice tracking requires HTTPS. The normal stat buttons are still available.'
          : 'This browser does not support voice tracking. The normal stat buttons are still available.'}
      </div>
    );
  }

  const instruction = promptActive
    ? 'Tap, then say a player, “unassisted”, or “skip”.'
    : 'Tap the court for a shot, or tap the microphone for another stat.';
  // A cycle has settled (recorded, rejected, or failed) and left something on screen to correct.
  const settled = !speech.busy && (speech.status !== 'idle' || Boolean(speech.transcript));

  if (courtTapOnly) {
    const message =
      speech.status === 'idle'
        ? 'Voice tracking is on. Select a court position to start listening.'
        : speech.message;

    return (
      <div className="flex items-center gap-2 px-1 text-sm text-slate-600">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            speech.busy ? 'animate-pulse bg-[#B42318]' : 'bg-[#1B4332]'
          }`}
          aria-hidden="true"
        />
        <p className="min-w-0 flex-1">{message}</p>
        {speech.cancellable ? (
          <button
            type="button"
            aria-label="Cancel voice command"
            onClick={() => speech.cancel()}
            className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
        ) : null}
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {message}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={speech.cancellable ? 'Cancel voice command' : 'Record voice command'}
          disabled={disabled || speech.status === 'processing'}
          onClick={() => (speech.cancellable ? speech.cancel() : speech.start())}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
            speech.status === 'listening'
              ? 'animate-pulse bg-[#B42318] hover:bg-[#912013]'
              : 'bg-[#141414] hover:bg-[#2a2a2a]'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
          </svg>
        </button>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Voice Tracking</p>
          <p className="text-xs text-slate-500">
            {speech.status === 'idle' ? instruction : speech.message}
          </p>
        </div>
        {settled ? (
          <button
            type="button"
            aria-label="Clear voice result"
            onClick={() => speech.reset()}
            className="ml-auto shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Clear
          </button>
        ) : null}
      </div>
      {speech.transcript ? (
        <p className="mt-2 truncate text-xs text-slate-600" title={speech.transcript}>
          Heard: “{speech.transcript}”
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {speech.status === 'idle' ? instruction : speech.message}
      </p>
    </div>
  );
}
