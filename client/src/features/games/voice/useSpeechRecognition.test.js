import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getSpeechRecognitionSupport, useSpeechRecognition } from './useSpeechRecognition';

class MockRecognition {
  static instances = [];

  constructor() {
    MockRecognition.instances.push(this);
    this.start = vi.fn();
    this.abort = vi.fn();
  }

  emitStart() {
    this.onstart?.();
  }

  emitResult(transcript) {
    const result = [{ transcript }];
    result.isFinal = true;
    this.onresult?.({ resultIndex: 0, results: [result] });
  }

  emitError(error) {
    this.onerror?.({ error });
  }

  emitEnd() {
    this.onend?.();
  }
}

function setSecureContext(value) {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value });
}

describe('useSpeechRecognition', () => {
  beforeEach(() => {
    MockRecognition.instances = [];
    setSecureContext(true);
    window.SpeechRecognition = MockRecognition;
    delete window.webkitSpeechRecognition;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    delete window.isSecureContext;
  });

  test('detects standard, prefixed, insecure, and unsupported environments', () => {
    expect(getSpeechRecognitionSupport().supported).toBe(true);
    delete window.SpeechRecognition;
    window.webkitSpeechRecognition = MockRecognition;
    expect(getSpeechRecognitionSupport().supported).toBe(true);
    setSecureContext(false);
    expect(getSpeechRecognitionSupport()).toEqual({ supported: false, reason: 'insecure' });
    setSecureContext(true);
    delete window.webkitSpeechRecognition;
    expect(getSpeechRecognitionSupport()).toEqual({ supported: false, reason: 'unsupported' });
  });

  test('configures one final en-GB result and claims it exactly once', async () => {
    const onStart = vi.fn(() => ({ gameId: 'game-1' }));
    const onResult = vi.fn(async () => ({ ok: true, message: 'Steal recorded.' }));
    const { result } = renderHook(() => useSpeechRecognition({ onStart, onResult }));

    act(() => expect(result.current.start()).toBe(true));
    const recognition = MockRecognition.instances[0];
    expect(recognition).toMatchObject({
      continuous: false,
      interimResults: false,
      maxAlternatives: 1,
      lang: 'en-GB',
    });
    act(() => recognition.emitStart());
    expect(result.current.status).toBe('listening');
    act(() => {
      recognition.emitResult('home 13 steal');
      recognition.emitResult('home 13 turnover');
      recognition.emitEnd();
    });

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith('home 13 steal', { gameId: 'game-1' });
  });

  test.each([
    ['not-allowed', 'permission_denied'],
    ['service-not-allowed', 'permission_denied'],
    ['no-speech', 'no_speech'],
    ['audio-capture', 'audio_unavailable'],
    ['network', 'network'],
    ['language-not-supported', 'service_error'],
  ])('maps %s failures without producing a result', (browserError, reason) => {
    const onResult = vi.fn();
    const onFailure = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onResult, onFailure }));
    act(() => {
      result.current.start();
      MockRecognition.instances[0].emitStart();
      MockRecognition.instances[0].emitError(browserError);
    });
    expect(result.current).toMatchObject({ status: 'error', reason });
    expect(onResult).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ reason }));
  });

  test('times out, aborts, and ignores late browser callbacks', () => {
    vi.useFakeTimers();
    const onResult = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onResult, timeoutMs: 50 }));
    act(() => {
      result.current.start();
      MockRecognition.instances[0].emitStart();
      vi.advanceTimersByTime(51);
    });
    const recognition = MockRecognition.instances[0];
    expect(result.current).toMatchObject({ status: 'error', reason: 'timeout' });
    expect(recognition.abort).toHaveBeenCalledTimes(1);
    act(() => recognition.emitResult('home 13 steal'));
    expect(onResult).not.toHaveBeenCalled();
  });

  test('blocks double start and supports explicit cancellation', () => {
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => {
      expect(result.current.start()).toBe(true);
      expect(result.current.start()).toBe(false);
      MockRecognition.instances[0].emitStart();
      expect(result.current.cancel()).toBe(true);
    });
    expect(MockRecognition.instances).toHaveLength(1);
    expect(MockRecognition.instances[0].abort).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
  });

  test('does not cancel after a final result has entered processing', async () => {
    let finishProcessing;
    const onResult = vi.fn(
      () =>
        new Promise((resolve) => {
          finishProcessing = resolve;
        })
    );
    const onFailure = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onResult, onFailure }));

    act(() => {
      result.current.start();
      MockRecognition.instances[0].emitStart();
      MockRecognition.instances[0].emitResult('home 13 steal');
    });

    expect(result.current).toMatchObject({ status: 'processing', cancellable: false });
    act(() => expect(result.current.cancel()).toBe(false));
    expect(MockRecognition.instances[0].abort).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();

    await act(async () => {
      finishProcessing({ ok: true, message: 'Steal recorded.' });
    });
    expect(result.current).toMatchObject({ status: 'success', message: 'Steal recorded.' });
  });

  test('aborts when disabled or when captured context becomes stale', () => {
    const { result, rerender } = renderHook(
      ({ disabled, version }) => useSpeechRecognition({ disabled, contextVersion: version }),
      { initialProps: { disabled: false, version: 'one' } }
    );
    act(() => {
      result.current.start();
      MockRecognition.instances[0].emitStart();
    });
    rerender({ disabled: false, version: 'two' });
    expect(MockRecognition.instances[0].abort).toHaveBeenCalledTimes(1);
    expect(result.current.reason).toBe('stale');

    act(() => {
      result.current.start();
      MockRecognition.instances[1].emitStart();
    });
    rerender({ disabled: true, version: 'two' });
    expect(MockRecognition.instances[1].abort).toHaveBeenCalledTimes(1);
  });

  test('aborts on page hide and unmount', () => {
    const first = renderHook(() => useSpeechRecognition());
    act(() => {
      first.result.current.start();
      MockRecognition.instances[0].emitStart();
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(MockRecognition.instances[0].abort).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const second = renderHook(() => useSpeechRecognition());
    act(() => {
      second.result.current.start();
      MockRecognition.instances[1].emitStart();
    });
    second.unmount();
    expect(MockRecognition.instances[1].abort).toHaveBeenCalledTimes(1);
    first.unmount();
  });

  // React.StrictMode (main.jsx) mounts, unmounts, then remounts every component in development.
  // The unmount cleanup flips `mountedRef`, so a hook that never restores it on remount silently
  // drops every state transition after `start()` and strands the UI on 'Starting microphone…'.
  test('still reports lifecycle transitions after StrictMode double-invokes effects', async () => {
    const onStart = vi.fn(() => ({ gameId: 'game-1' }));
    const onResult = vi.fn(async () => ({ ok: true, message: 'Steal recorded.' }));
    const { result } = renderHook(() => useSpeechRecognition({ onStart, onResult }), {
      wrapper: StrictMode,
    });

    act(() => {
      result.current.start();
    });
    act(() => MockRecognition.instances[0].emitStart());
    expect(result.current.status).toBe('listening');

    act(() => MockRecognition.instances[0].emitResult('home 13 steal'));
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.message).toBe('Steal recorded.');
  });

  // A browser can accept start() and then never fire onstart (permission stalls, an iOS/Safari
  // service hang). The listening timeout is armed inside onstart, so without a start-phase timeout
  // the UI strands on 'Starting microphone…' with no recovery.
  test('aborts and reports when the browser never fires onstart', () => {
    vi.useFakeTimers();
    const onFailure = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onFailure, startTimeoutMs: 100 }));

    act(() => {
      result.current.start();
    });
    expect(result.current.status).toBe('starting');

    act(() => {
      vi.advanceTimersByTime(101);
    });

    expect(result.current).toMatchObject({ status: 'error', reason: 'start_timeout' });
    expect(MockRecognition.instances[0].abort).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ reason: 'start_timeout' }));
  });

  test('clears the start-phase timeout once recognition actually begins', () => {
    vi.useFakeTimers();
    const onFailure = vi.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onFailure, startTimeoutMs: 100, timeoutMs: 5000 })
    );

    act(() => {
      result.current.start();
    });
    act(() => MockRecognition.instances[0].emitStart());
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.status).toBe('listening');
    expect(MockRecognition.instances[0].abort).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });

  test('fails safely when the constructor start call throws', () => {
    class ThrowingRecognition extends MockRecognition {
      constructor() {
        super();
        this.start = vi.fn(() => {
          throw new Error('blocked');
        });
      }
    }
    window.SpeechRecognition = ThrowingRecognition;
    const { result } = renderHook(() => useSpeechRecognition());
    act(() => expect(result.current.start()).toBe(false));
    expect(result.current).toMatchObject({ status: 'error', reason: 'start_failed' });
  });

  test('fails safely when the recognition constructor throws', () => {
    const onFailure = vi.fn();
    window.SpeechRecognition = class ThrowingConstructor {
      constructor() {
        throw new Error('constructor blocked');
      }
    };
    const { result } = renderHook(() => useSpeechRecognition({ onFailure }));

    act(() => expect(result.current.start()).toBe(false));

    expect(result.current).toMatchObject({ status: 'error', reason: 'start_failed' });
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ reason: 'start_failed' }));
  });

  test('reports an insecure context through the hook and never opens a recognition instance', () => {
    setSecureContext(false);
    const onStart = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onStart }));

    expect(result.current).toMatchObject({ supported: false, supportReason: 'insecure' });
    act(() => expect(result.current.start()).toBe(false));
    expect(result.current).toMatchObject({
      status: 'error',
      reason: 'insecure',
      message: 'Voice tracking requires a secure HTTPS connection.',
      transcript: '',
    });
    expect(MockRecognition.instances).toHaveLength(0);
    expect(onStart).not.toHaveBeenCalled();
  });

  test('reports an unsupported browser through the hook and never opens a recognition instance', () => {
    delete window.SpeechRecognition;
    const onStart = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onStart }));

    expect(result.current).toMatchObject({ supported: false, supportReason: 'unsupported' });
    act(() => expect(result.current.start()).toBe(false));
    expect(result.current).toMatchObject({
      status: 'error',
      reason: 'unsupported',
      message: 'Voice tracking is not supported by this browser.',
      transcript: '',
    });
    expect(MockRecognition.instances).toHaveLength(0);
    expect(onStart).not.toHaveBeenCalled();
  });

  test('refuses to start while the hook is disabled', () => {
    const onStart = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ disabled: true, onStart }));

    act(() => expect(result.current.start()).toBe(false));
    expect(MockRecognition.instances).toHaveLength(0);
    expect(onStart).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ status: 'idle', message: '', reason: null });
  });

  test('reports the unmounted failure and stops updating state afterwards', () => {
    const onStart = vi.fn(() => ({ gameId: 'game-1' }));
    const onResult = vi.fn();
    const onFailure = vi.fn();
    const { result, unmount } = renderHook(() =>
      useSpeechRecognition({ onStart, onResult, onFailure })
    );

    act(() => {
      result.current.start();
      MockRecognition.instances[0].emitStart();
    });
    const recognition = MockRecognition.instances[0];
    const stateBeforeUnmount = {
      status: result.current.status,
      transcript: result.current.transcript,
      message: result.current.message,
      reason: result.current.reason,
    };

    unmount();

    expect(recognition.abort).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith({ reason: 'unmounted', context: { gameId: 'game-1' } });

    act(() => {
      recognition.emitResult('home 13 steal');
      recognition.emitEnd();
      recognition.emitError('network');
    });

    expect(onResult).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject(stateBeforeUnmount);
  });

  test('fails the cycle when the start-context callback throws', () => {
    const onStart = vi.fn(() => {
      throw new Error('lineup changed mid-start');
    });
    const onResult = vi.fn();
    const onFailure = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onStart, onResult, onFailure }));

    act(() => {
      result.current.start();
      MockRecognition.instances[0].emitStart();
    });

    expect(result.current).toMatchObject({
      status: 'error',
      reason: 'context_error',
      message: 'Tracking changed. No stat was recorded.',
    });
    expect(MockRecognition.instances[0].abort).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'context_error', context: null })
    );
    expect(onResult).not.toHaveBeenCalled();
  });

  test('reports a processing error when the command handler rejects', async () => {
    const onResult = vi.fn(async () => {
      throw new Error('write failed');
    });
    const onFailure = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onResult, onFailure }));

    act(() => {
      result.current.start();
      MockRecognition.instances[0].emitStart();
      MockRecognition.instances[0].emitResult('home 13 steal');
    });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: 'error',
        reason: 'processing_error',
        message: 'The command could not be recorded.',
        transcript: 'home 13 steal',
      })
    );
    expect(onFailure).toHaveBeenCalledWith({ reason: 'processing_error', context: null });
  });

  test('shows the default rejection message when the command handler declines the transcript', async () => {
    const onResult = vi.fn(async () => ({ ok: false }));
    const onFailure = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onResult, onFailure }));

    act(() => {
      result.current.start();
      MockRecognition.instances[0].emitStart();
      MockRecognition.instances[0].emitResult('home 13 sandwich');
    });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: 'error',
        reason: 'rejected',
        message: 'Command not recognised. No stat was recorded.',
        transcript: 'home 13 sandwich',
      })
    );
    expect(onFailure).not.toHaveBeenCalled();
  });

  test('reset clears a settled cycle without releasing a second command from it', async () => {
    const onResult = vi.fn(async () => ({ ok: true, message: 'Steal recorded.' }));
    const { result } = renderHook(() => useSpeechRecognition({ onResult }));

    act(() => {
      result.current.start();
      MockRecognition.instances[0].emitStart();
      MockRecognition.instances[0].emitResult('home 13 steal');
    });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => expect(result.current.reset()).toBe(true));
    expect(result.current).toMatchObject({
      status: 'idle',
      transcript: '',
      message: '',
      reason: null,
      busy: false,
    });

    act(() => {
      MockRecognition.instances[0].emitResult('home 13 turnover');
      MockRecognition.instances[0].emitEnd();
    });
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');

    act(() => expect(result.current.start()).toBe(true));
    expect(MockRecognition.instances).toHaveLength(2);
  });

  test('reset leaves an in-flight cycle alone', () => {
    const { result } = renderHook(() => useSpeechRecognition());

    act(() => {
      result.current.start();
      MockRecognition.instances[0].emitStart();
    });

    act(() => expect(result.current.reset()).toBe(false));
    expect(result.current).toMatchObject({ status: 'listening', busy: true });
    expect(MockRecognition.instances[0].abort).not.toHaveBeenCalled();
  });
});
