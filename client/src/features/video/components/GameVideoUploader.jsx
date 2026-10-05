import { useEffect, useRef, useState } from 'react';
import { createUpload } from '@mux/upchunk';
import { videoApi } from '../api/videoApi';
import { gamesApi } from '../../games/api/gamesApi';
export const MAX_VIDEO_UPLOAD_BYTES = 20 * 1024 ** 3;
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 10 * 60 * 1000;
function storedAttempt(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function rememberAttempt(key, id) {
  try {
    if (id) sessionStorage.setItem(key, id);
    else sessionStorage.removeItem(key);
  } catch {
    /* optional recovery storage */
  }
}
export function GameVideoUploader({ gameId, video, videoUrl = null, allowance, onMediaChange }) {
  const storageKey = `gameVideoAttempt:${gameId}`;
  const [phase, setPhase] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [sameRecording, setSameRecording] = useState(false);
  const [pollStopped, setPollStopped] = useState(false);
  const [pollCycle, setPollCycle] = useState(0);
  const operation = useRef({
    attemptId: storedAttempt(storageKey),
    upload: null,
    transferring: false,
    creating: false,
    cancelled: false,
  });
  const mounted = useRef(false);
  const revision = useRef(0);
  const notify = useRef(onMediaChange);
  notify.current = onMediaChange;
  useEffect(() => {
    mounted.current = true;
    const current = operation.current;
    return () => {
      mounted.current = false;
      if (current.transferring || current.creating) {
        current.cancelled = true;
        current.upload?.abort();
        if (current.attemptId)
          videoApi
            .cancelUpload(gameId, current.attemptId)
            .then(() => rememberAttempt(storageKey, null))
            .catch(() => {});
      }
    };
  }, [gameId, storageKey]);
  const pending =
    ['uploading', 'processing'].includes(video?.status) ||
    ['uploading', 'processing'].includes(phase);
  useEffect(() => {
    if (video?.status !== 'ready') return;
    operation.current.transferring = false;
    operation.current.attemptId = null;
    rememberAttempt(storageKey, null);
    setPhase('idle');
    setError('');
  }, [video?.status, storageKey]);
  async function refresh() {
    const generation = revision.current;
    const result = await gamesApi.getById(gameId);
    if (!mounted.current || generation !== revision.current) return;
    // V21: a missing `video` mid-transfer is not a server discard (losing
    // replay entitlement hides it too). Keep the transfer; its own success or
    // error, and the next poll after it ends, decide.
    if (!result.game.video && operation.current.transferring) return;
    notify.current?.({
      video: result.game.video ?? null,
      videoProvider: result.game.videoProvider,
      videoUpload: result.videoUpload,
    });
    if (!result.game.video) {
      if (!operation.current.cancelled)
        setError('The upload is no longer available. It may have failed video checks.');
      operation.current.upload?.abort();
      operation.current.transferring = false;
      operation.current.attemptId = null;
      rememberAttempt(storageKey, null);
      setPhase('idle');
    } else if (result.game.video.status === 'errored') {
      setPhase('failed');
      setError('The video could not be processed. Remove it and try another file.');
    }
  }
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  // V3: a full-game transfer can outlast the processing window, so the
  // ten-minute limit applies only once this tab is no longer transferring;
  // the effect restarts (and the window with it) when the transfer ends.
  const transferring = phase === 'uploading';
  useEffect(() => {
    if (!pending) return undefined;
    let stopped = false;
    let timer;
    const started = Date.now();
    setPollStopped(false);
    const poll = async () => {
      if (stopped) return;
      if (!transferring && Date.now() - started >= MAX_POLL_MS) {
        setPollStopped(true);
        return;
      }
      try {
        await refreshRef.current();
      } catch {
        if (!stopped && mounted.current) setError('Could not check video status. Reconnecting…');
      }
      if (!stopped) timer = setTimeout(poll, POLL_INTERVAL_MS);
    };
    timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pending, transferring, gameId, pollCycle]);
  async function start(file) {
    if (
      !file ||
      operation.current.creating ||
      operation.current.transferring ||
      operation.current.attemptId
    )
      return;
    if (!file.type.startsWith('video/') || file.size <= 0 || file.size > MAX_VIDEO_UPLOAD_BYTES) {
      setError('Choose a video file up to 20 GB.');
      return;
    }
    const current = operation.current;
    revision.current += 1;
    current.cancelled = false;
    current.creating = true;
    setError('');
    setProgress(0);
    setPhase('creating');
    try {
      const result = await videoApi.createUpload(gameId, {
        sizeBytes: file.size,
        mimeType: file.type,
        sameRecording,
      });
      current.attemptId = result.attemptId;
      rememberAttempt(storageKey, result.attemptId);
      current.creating = false;
      if (!mounted.current || current.cancelled) {
        await videoApi.cancelUpload(gameId, result.attemptId);
        rememberAttempt(storageKey, null);
        current.attemptId = null;
        if (mounted.current) {
          setPhase('idle');
          notify.current?.({ video: null });
        }
        return;
      }
      notify.current?.({ video: result.video });
      current.transferring = true;
      setPhase('uploading');
      // The bearer URL exists only inside this upload operation; never cache,
      // persist, log or send it to analytics.
      const upload = createUpload({ endpoint: result.uploadUrl, file, chunkSize: 5120 });
      current.upload = upload;
      upload.on('progress', (e) => {
        if (mounted.current && !current.cancelled) setProgress(Math.round(e.detail));
      });
      upload.on('success', () => {
        current.transferring = false;
        if (mounted.current && !current.cancelled) {
          setPhase('processing');
          setProgress(100);
          refreshRef.current().catch(() => {});
        }
      });
      upload.on('error', () => {
        if (mounted.current && !current.cancelled) {
          setPhase('failed');
          setError('The transfer failed. Cancel this upload before trying again.');
        }
      });
    } catch (err) {
      current.creating = false;
      if (mounted.current) {
        setPhase('failed');
        setError(
          current.cancelled
            ? 'Cancellation could not be confirmed. Try cancelling again.'
            : err.message || 'Could not start the upload.'
        );
      }
    }
  }
  async function cancel() {
    const current = operation.current;
    revision.current += 1;
    current.cancelled = true;
    current.upload?.abort();
    setError('');
    setPhase('cancelling');
    // The create request still owns compensation until it returns an id.
    if (current.creating && !current.attemptId) return;
    try {
      if (current.attemptId) await videoApi.cancelUpload(gameId, current.attemptId);
      else await videoApi.remove(gameId); // recovery after another tab/reload
      current.transferring = false;
      current.attemptId = null;
      rememberAttempt(storageKey, null);
      setPhase('idle');
      notify.current?.({ video: null });
    } catch (err) {
      setPhase('failed');
      setError(
        err.status === 409
          ? 'The video may have finished processing. Refresh its status and use Remove video.'
          : 'Cancellation could not be confirmed. Try cancelling again.'
      );
    }
  }
  async function remove() {
    revision.current += 1;
    setError('');
    setPhase('removing');
    try {
      await videoApi.remove(gameId);
      rememberAttempt(storageKey, null);
      operation.current.attemptId = null;
      notify.current?.({ video: null });
      setPhase('idle');
    } catch (err) {
      setPhase('idle');
      setError(err.message || 'Could not remove video.');
    }
  }
  const busy = ['creating', 'cancelling', 'removing'].includes(phase);
  const canStart =
    allowance?.allowed && !video && !pending && !operation.current.attemptId && !busy;
  if (!allowance && !video && phase === 'idle') return null;
  return (
    <section
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
      aria-label="Hosted game video"
    >
      <p className="text-sm font-semibold text-slate-900">Upload game video</p>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {phase === 'creating' ? <p role="status">Starting upload…</p> : null}
      {phase === 'uploading' ? (
        <>
          <progress
            aria-label="Video upload progress"
            value={progress}
            max={100}
            className="w-full"
          />
          <p role="status">Uploading {progress}% — keep this page open.</p>
        </>
      ) : null}
      {video?.status === 'processing' || phase === 'processing' ? (
        <p role="status">Processing video. You can leave this page and check again later.</p>
      ) : null}
      {video?.status === 'uploading' && phase === 'idle' ? (
        <p role="status">An upload is pending. Cancel it to choose a new file.</p>
      ) : null}
      {video?.status === 'ready' ? <p role="status">Video ready</p> : null}
      {pollStopped ? (
        <p role="status">Processing is taking longer. Refresh to check again.</p>
      ) : null}
      {pending || error ? (
        <button
          type="button"
          onClick={() => {
            setPollCycle((v) => v + 1);
            refreshRef.current().catch(() => setError('Could not check video status.'));
          }}
          className="text-sm font-semibold underline"
        >
          Refresh video status
        </button>
      ) : null}
      {(pending ||
        operation.current.attemptId ||
        phase === 'creating' ||
        phase === 'cancelling' ||
        // V21: an unconfirmed cancellation must stay retryable.
        (phase === 'failed' && operation.current.cancelled)) &&
      video?.status !== 'ready' ? (
        <button
          type="button"
          onClick={cancel}
          disabled={phase === 'cancelling'}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {phase === 'cancelling' ? 'Cancelling…' : 'Cancel upload'}
        </button>
      ) : null}
      {video?.status === 'ready' || video?.status === 'errored' ? (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700"
        >
          {phase === 'removing' ? 'Removing…' : 'Remove video'}
        </button>
      ) : null}
      {canStart ? (
        <>
          {videoUrl ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sameRecording}
                onChange={(e) => setSameRecording(e.target.checked)}
              />
              Same recording and timing as the linked video
            </label>
          ) : null}
          <label className="block text-sm font-semibold">
            Choose game video
            <input
              aria-label="Choose game video"
              type="file"
              accept="video/*"
              className="mt-2 block w-full text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                start(file);
              }}
            />
          </label>
          <p className="text-xs text-slate-500">
            Up to 20 GB and 3 hours. A different recording makes existing highlights unavailable
            until their timestamps are corrected.
          </p>
        </>
      ) : null}
      {allowance?.allowed === false && !video ? (
        <p className="text-xs text-slate-500">
          Hosted uploads are not enabled for this game. You can still link a YouTube video.
        </p>
      ) : null}
    </section>
  );
}
