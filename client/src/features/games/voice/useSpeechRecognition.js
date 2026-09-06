import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_TIMEOUT_MS = 8000;
// Generous on purpose: the gap before `onstart` can contain a first-time permission prompt that a
// human has to click. This only exists to break a browser that never starts at all.
const DEFAULT_START_TIMEOUT_MS = 15000;

const ERROR_DETAILS = {
  'not-allowed': {
    reason: 'permission_denied',
    message: 'Microphone permission was denied. You can keep using the stat buttons.',
  },
  'service-not-allowed': {
    reason: 'permission_denied',
    message: 'Speech recognition is blocked in this browser. You can keep using the stat buttons.',
  },
  'no-speech': {
    reason: 'no_speech',
    message: 'No speech was heard. Tap the microphone to retry.',
  },
  'audio-capture': {
    reason: 'audio_unavailable',
    message: 'No microphone is available. You can keep using the stat buttons.',
  },
  network: {
    reason: 'network',
    message: 'The browser speech service could not be reached. No stat was recorded.',
  },
};

function recognitionError(errorCode) {
  return (
    ERROR_DETAILS[errorCode] || {
      reason: 'service_error',
      message: 'Speech recognition failed. No stat was recorded.',
    }
  );
}

export function getSpeechRecognitionSupport() {
  if (typeof window === 'undefined') return { supported: false, reason: 'unsupported' };
  if (window.isSecureContext === false) return { supported: false, reason: 'insecure' };
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  return Recognition
    ? { supported: true, Recognition }
    : { supported: false, reason: 'unsupported' };
}

function finalTranscriptFromEvent(event) {
  for (let index = event?.resultIndex || 0; index < (event?.results?.length || 0); index += 1) {
    const result = event.results[index];
    if (result?.isFinal !== false && result?.[0]?.transcript) return result[0].transcript;
  }
  return '';
}

export function useSpeechRecognition({
  disabled = false,
  contextVersion = '',
  lang = 'en-GB',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  startTimeoutMs = DEFAULT_START_TIMEOUT_MS,
  onStart,
  onResult,
  onFailure,
} = {}) {
  const support = getSpeechRecognitionSupport();
  const [state, setState] = useState({
    status: 'idle',
    transcript: '',
    message: '',
    reason: null,
  });
  const cycleRef = useRef(null);
  const nextCycleIdRef = useRef(0);
  const mountedRef = useRef(true);
  const callbacksRef = useRef({ onStart, onResult, onFailure });
  const contextVersionRef = useRef(contextVersion);

  callbacksRef.current = { onStart, onResult, onFailure };
  contextVersionRef.current = contextVersion;

  const clearCycle = useCallback((cycle) => {
    if (cycle.timeoutId) window.clearTimeout(cycle.timeoutId);
    if (cycle.startTimeoutId) window.clearTimeout(cycle.startTimeoutId);
    cycle.recognition.onstart = null;
    cycle.recognition.onresult = null;
    cycle.recognition.onerror = null;
    cycle.recognition.onend = null;
    if (cycleRef.current?.id === cycle.id) cycleRef.current = null;
  }, []);

  const failCycle = useCallback(
    (cycle, details, { abort = false, idle = false } = {}) => {
      if (!cycle || cycle.settled || cycleRef.current?.id !== cycle.id) return false;
      cycle.settled = true;
      if (abort) {
        try {
          cycle.recognition.abort();
        } catch {
          // A browser may throw if recognition already ended. The cycle guard still settles it.
        }
      }
      clearCycle(cycle);
      callbacksRef.current.onFailure?.({ ...details, context: cycle.context });
      if (mountedRef.current) {
        setState((current) => ({
          status: idle ? 'idle' : 'error',
          transcript: current.transcript,
          message: idle ? '' : details.message,
          reason: idle ? null : details.reason,
        }));
      }
      return true;
    },
    [clearCycle]
  );

  const cancel = useCallback(
    (reason = 'cancelled') => {
      const cycle = cycleRef.current;
      // Once a final transcript has been handed to the command handler, cancellation cannot
      // safely promise "nothing was recorded": the write may already be in flight. Let that
      // single claimed result settle instead of exposing a fallback that could duplicate it.
      if (!cycle || cycle.resultClaimed) return false;
      return failCycle(
        cycle,
        { reason, message: reason === 'stale' ? 'Tracking changed. No stat was recorded.' : '' },
        {
          abort: true,
          idle: reason === 'cancelled' || reason === 'disabled' || reason === 'hidden',
        }
      );
    },
    [failCycle]
  );

  // Discards the *displayed* outcome of an already-settled cycle so a mis-heard command can be
  // dismissed. It never touches cycle state, so it cannot resurrect a settled cycle or release a
  // second command: a settled cycle has already cleared `cycleRef`, and a live one is left alone.
  const reset = useCallback(() => {
    if (cycleRef.current || !mountedRef.current) return false;
    setState({ status: 'idle', transcript: '', message: '', reason: null });
    return true;
  }, []);

  const start = useCallback(() => {
    if (disabled || cycleRef.current) return false;
    const currentSupport = getSpeechRecognitionSupport();
    if (!currentSupport.supported) {
      const message =
        currentSupport.reason === 'insecure'
          ? 'Voice tracking requires a secure HTTPS connection.'
          : 'Voice tracking is not supported by this browser.';
      setState({ status: 'error', transcript: '', message, reason: currentSupport.reason });
      return false;
    }

    let recognition;
    try {
      recognition = new currentSupport.Recognition();
    } catch {
      const details = {
        reason: 'start_failed',
        message: 'The microphone could not be started. No stat was recorded.',
      };
      callbacksRef.current.onFailure?.(details);
      if (mountedRef.current) {
        setState({
          status: 'error',
          transcript: '',
          message: details.message,
          reason: details.reason,
        });
      }
      return false;
    }
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.lang = lang;

    const cycle = {
      id: (nextCycleIdRef.current += 1),
      recognition,
      resultClaimed: false,
      settled: false,
      started: false,
      context: null,
      contextVersion: null,
      timeoutId: null,
      startTimeoutId: null,
    };
    cycleRef.current = cycle;
    setState({ status: 'starting', transcript: '', message: 'Starting microphone…', reason: null });

    recognition.onstart = () => {
      if (cycle.settled || cycleRef.current?.id !== cycle.id) return;
      if (cycle.startTimeoutId) {
        window.clearTimeout(cycle.startTimeoutId);
        cycle.startTimeoutId = null;
      }
      cycle.started = true;
      cycle.contextVersion = contextVersionRef.current;
      try {
        cycle.context = callbacksRef.current.onStart?.() ?? null;
      } catch {
        failCycle(
          cycle,
          { reason: 'context_error', message: 'Tracking changed. No stat was recorded.' },
          { abort: true }
        );
        return;
      }
      cycle.timeoutId = window.setTimeout(() => {
        failCycle(
          cycle,
          { reason: 'timeout', message: 'Listening timed out. No stat was recorded.' },
          { abort: true }
        );
      }, timeoutMs);
      if (mountedRef.current) {
        setState({ status: 'listening', transcript: '', message: 'Listening…', reason: null });
      }
    };

    recognition.onresult = async (event) => {
      if (cycle.settled || cycle.resultClaimed || cycleRef.current?.id !== cycle.id) return;
      const transcript = finalTranscriptFromEvent(event);
      if (!transcript) return;
      cycle.resultClaimed = true;
      if (cycle.timeoutId) window.clearTimeout(cycle.timeoutId);
      if (mountedRef.current) {
        setState({ status: 'processing', transcript, message: 'Checking command…', reason: null });
      }

      try {
        const result = (await callbacksRef.current.onResult?.(transcript, cycle.context)) || {
          ok: true,
        };
        if (cycleRef.current?.id !== cycle.id) return;
        cycle.settled = true;
        clearCycle(cycle);
        if (mountedRef.current) {
          setState({
            status: result.ok === false ? 'error' : 'success',
            transcript,
            message:
              result.message ||
              (result.ok === false ? 'Command not recognised. No stat was recorded.' : 'Recorded.'),
            reason: result.ok === false ? result.reason || 'rejected' : null,
          });
        }
      } catch {
        if (cycleRef.current?.id !== cycle.id) return;
        cycle.settled = true;
        clearCycle(cycle);
        callbacksRef.current.onFailure?.({ reason: 'processing_error', context: cycle.context });
        if (mountedRef.current) {
          setState({
            status: 'error',
            transcript,
            message: 'The command could not be recorded.',
            reason: 'processing_error',
          });
        }
      }
    };

    recognition.onerror = (event) => {
      if (event?.error === 'aborted' && cycle.settled) return;
      failCycle(cycle, recognitionError(event?.error));
    };

    recognition.onend = () => {
      if (cycle.settled || cycle.resultClaimed || cycleRef.current?.id !== cycle.id) return;
      failCycle(cycle, recognitionError('no-speech'));
    };

    try {
      recognition.start();
      cycle.startTimeoutId = window.setTimeout(() => {
        if (cycle.started) return;
        failCycle(
          cycle,
          {
            reason: 'start_timeout',
            message:
              'The microphone did not start. Check microphone permission, or use the stat buttons.',
          },
          { abort: true }
        );
      }, startTimeoutMs);
      return true;
    } catch {
      failCycle(cycle, {
        reason: 'start_failed',
        message: 'The microphone could not be started. No stat was recorded.',
      });
      return false;
    }
  }, [clearCycle, disabled, failCycle, lang, startTimeoutMs, timeoutMs]);

  useEffect(() => {
    const cycle = cycleRef.current;
    if (cycle?.started && !cycle.resultClaimed && cycle.contextVersion !== contextVersion) {
      cancel('stale');
    }
  }, [cancel, contextVersion]);

  useEffect(() => {
    if (disabled && !cycleRef.current?.resultClaimed) cancel('disabled');
  }, [cancel, disabled]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') cancel('hidden');
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [cancel]);

  useEffect(() => {
    // Restore on every mount, not just the first. StrictMode runs the cleanup below once before the
    // real mount, and without this the ref stays false forever and every later setState is dropped.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const cycle = cycleRef.current;
      if (cycle && !cycle.settled) {
        cycle.settled = true;
        try {
          cycle.recognition.abort();
        } catch {
          // Ignore teardown errors from already-ended browser recognition.
        }
        if (!cycle.resultClaimed) {
          callbacksRef.current.onFailure?.({ reason: 'unmounted', context: cycle.context });
        }
        clearCycle(cycle);
      }
    };
  }, [clearCycle]);

  return {
    ...state,
    supported: support.supported,
    supportReason: support.supported ? null : support.reason,
    busy: ['starting', 'listening', 'processing'].includes(state.status),
    cancellable: ['starting', 'listening'].includes(state.status),
    start,
    cancel,
    reset,
  };
}
