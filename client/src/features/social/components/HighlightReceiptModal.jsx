import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { ExportGuardNotice } from './ExportGuardNotice';
import { marketingFingerprint, resolveExportGuard } from '../exportGuard';
import {
  buildHighlightReceiptPlan,
  eligibleReceiptHighlights,
  receiptRecordingType,
} from '../highlightReceipt';
import { renderHighlightReceipt } from '../renderHighlightReceipt';

export function HighlightReceiptModal({ open, onClose, data, marketing, refreshMarketing }) {
  const videoRef = useRef(null);
  const [highlightId, setHighlightId] = useState('');
  const [momentSeconds, setMomentSeconds] = useState(0);
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceDuration, setSourceDuration] = useState(null);
  const [sourceCredit, setSourceCredit] = useState('');
  const [clipConfirmed, setClipConfirmed] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const highlights = useMemo(() => eligibleReceiptHighlights(data, marketing), [data, marketing]);
  const selected =
    highlights.find((highlight) => highlight.eventId === highlightId) || highlights[0];
  const recordingType = receiptRecordingType();
  const supportsCanvasCapture =
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function';
  const guard = resolveExportGuard(marketing);

  useEffect(() => {
    if (selected && !highlightId) setMomentSeconds(selected.videoTimestamp);
  }, [selected, highlightId]);

  useEffect(() => {
    if (!sourceFile) {
      setSourceUrl('');
      setSourceDuration(null);
      return undefined;
    }
    const url = URL.createObjectURL(sourceFile);
    setSourceUrl(url);
    setSourceDuration(null);
    return () => URL.revokeObjectURL(url);
  }, [sourceFile]);

  const plan = buildHighlightReceiptPlan({
    data,
    marketing,
    highlight: selected,
    sourceDuration,
    sourceCredit,
    momentSeconds,
  });
  const canRender = Boolean(
    sourceFile &&
    recordingType &&
    supportsCanvasCapture &&
    clipConfirmed &&
    !plan.error &&
    !rendering
  );

  async function download() {
    setError('');
    setPreviewing(false);
    setRendering(true);
    setProgress(0);
    try {
      if (refreshMarketing) {
        const latest = await refreshMarketing().catch(() => null);
        if (marketingFingerprint(latest) !== marketingFingerprint(marketing)) {
          throw new Error(
            'Permission changed or could not be confirmed. Review the clip and try again.'
          );
        }
      }
      const { blob, extension } = await renderHighlightReceipt({
        video: videoRef.current,
        plan,
        onProgress: setProgress,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tsw-highlight-${data.game.id}-${selected.eventId}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (renderError) {
      setError(renderError.message || 'Could not export the video.');
    } finally {
      setRendering(false);
      setProgress(0);
    }
  }

  function previewSelection() {
    if (plan.error || !videoRef.current) return;
    const video = videoRef.current;
    video.pause();
    video.currentTime = plan.startSeconds;
    video.muted = true;
    setPreviewing(true);
    video.play().catch(() => {
      setPreviewing(false);
      setError('Could not play the source preview.');
    });
  }

  return (
    <Modal
      open={open}
      onClose={rendering ? () => {} : onClose}
      title="Highlight + stat receipt"
      panelClassName="!max-w-2xl"
    >
      <div className="space-y-4 text-sm text-slate-700">
        <p>
          Choose a timestamped play and the matching original video file. The ten-second vertical
          export burns in the player, verified box-score line, final score, source credit, and end
          card. The source stays on this device.
        </p>
        <ExportGuardNotice guard={guard} />
        {guard.canExport && highlights.length === 0 ? (
          <p role="status" className="rounded-lg bg-amber-50 p-3 text-amber-900">
            No timestamped, cleared player plays with a final box-score line are available.
          </p>
        ) : null}
        {highlights.length > 0 ? (
          <label className="block font-medium">
            Play
            <select
              aria-label="Receipt play"
              value={selected?.eventId || ''}
              disabled={rendering}
              onChange={(event) => {
                const next = highlights.find((item) => item.eventId === event.target.value);
                setHighlightId(event.target.value);
                setMomentSeconds(next?.videoTimestamp ?? 0);
                setClipConfirmed(false);
              }}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            >
              {highlights.map((highlight) => (
                <option key={highlight.eventId} value={highlight.eventId}>
                  {highlight.playerName || 'Player'} · {highlight.statType} ·{' '}
                  {highlight.videoTimestamp}s
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block font-medium">
          Matching source video on your device
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            aria-label="Source video file"
            disabled={rendering}
            onChange={(event) => {
              setSourceFile(event.target.files?.[0] || null);
              setClipConfirmed(false);
            }}
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        {sourceUrl ? (
          <video
            ref={videoRef}
            src={sourceUrl}
            controls
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => setSourceDuration(event.currentTarget.duration)}
            onTimeUpdate={(event) => {
              if (
                previewing &&
                event.currentTarget.currentTime >= plan.startSeconds + plan.playSeconds
              ) {
                event.currentTarget.pause();
                setPreviewing(false);
              }
            }}
            className="max-h-64 w-full rounded-lg bg-black"
          />
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block font-medium">
            Moment time in source (seconds)
            <input
              type="number"
              min="0"
              step="0.1"
              value={momentSeconds}
              disabled={rendering}
              onChange={(event) => {
                setMomentSeconds(Number(event.target.value));
                setClipConfirmed(false);
              }}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block font-medium">
            Source-video credit
            <input
              type="text"
              maxLength={100}
              value={sourceCredit}
              placeholder="Videographer or club"
              disabled={rendering}
              onChange={(event) => setSourceCredit(event.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        {sourceFile && plan.error ? (
          <p role="status" className="text-amber-800">
            {plan.error}
          </p>
        ) : null}
        {sourceFile && !plan.error ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-slate-900">
              {plan.playerName} · {plan.playLabel}
            </p>
            <p>{plan.statLine}</p>
            <p>{plan.result}</p>
            <button
              type="button"
              disabled={rendering}
              onClick={previewSelection}
              className="mt-2 rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-800 disabled:opacity-50"
            >
              {previewing ? 'Replay selection' : 'Preview selected seven seconds'}
            </button>
          </div>
        ) : null}
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={clipConfirmed}
            disabled={rendering}
            onChange={(event) => setClipConfirmed(event.target.checked)}
            className="mt-1"
          />
          <span>
            I checked that everyone identifiable in this clip is covered by permission and that I
            may use the source footage.
          </span>
        </label>
        {!recordingType || !supportsCanvasCapture ? (
          <p role="status" className="text-amber-800">
            This browser cannot record the clip. Try a current desktop browser.
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            Output: 1080×1920 {recordingType.extension.toUpperCase()}, silent, ten seconds. Keep
            this tab visible while it renders. Check the selected moment in the source preview
            first.
          </p>
        )}
        {error ? (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        ) : null}
        {rendering ? (
          <progress
            aria-label="Video export progress"
            value={progress}
            max="1"
            className="w-full"
          />
        ) : null}
        <button
          type="button"
          disabled={!canRender}
          onClick={download}
          className="w-full rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {rendering ? 'Rendering clip…' : 'Download vertical clip'}
        </button>
      </div>
    </Modal>
  );
}
