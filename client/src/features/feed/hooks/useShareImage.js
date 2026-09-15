import { useCallback, useState } from 'react';
import html2canvas from 'html2canvas';

// Rasterises an off-screen ShareableCardExport node, then either hands the file
// to the OS share sheet or downloads it.
//
// The node carries its own capture scale in `data-capture-scale`: the honours
// board is composed at 1080x1350 and uses 2x for crispness, while the game card
// is laid out at feed scale and relies on capture to reach 1080x1350. Story and
// link compositions render at their exact target sizes and use 1x. One
// hard-coded scale here would produce incorrectly sized PNGs.
const DEFAULT_CAPTURE_SCALE = 2;

function captureScaleOf(node) {
  const declared = Number(node?.dataset?.captureScale);
  return Number.isFinite(declared) && declared > 0 ? declared : DEFAULT_CAPTURE_SCALE;
}

export function useShareImage() {
  const [status, setStatus] = useState('idle');

  // Split out of shareImage so the Instagram hand-off can take the same File
  // the share sheet would have received, rather than re-deriving the image.
  const createImageFile = useCallback(async (node, fileName) => {
    if (!node) return null;
    setStatus('generating');

    try {
      const canvas = await html2canvas(node, {
        backgroundColor: null,
        useCORS: true,
        scale: captureScaleOf(node),
        logging: false,
      });
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Failed to produce image blob');
      const file = new File([blob], fileName, { type: 'image/png' });
      setStatus('success');
      return file;
    } catch {
      setStatus('error');
      return null;
    }
  }, []);

  // Social backlog rank 5. Both share events are emitted from here rather than
  // from the button, because only this function knows which path was taken —
  // and reporting one method on `share_initiated` and a different one on
  // `share_completed` would make the method breakdown unreadable.
  //
  // `share_initiated` therefore means "the share was actually attempted", after
  // the PNG rendered. A render that fails emits neither event, which is the
  // honest reading: nothing was ever offered to the operating system.
  const shareImage = useCallback(
    async (node, fileName, onShareEvent) => {
      const report = (event, properties) => onShareEvent?.(event, properties);

      const file = await createImageFile(node, fileName);
      if (!file) return null;
      // createImageFile settles on 'success' for the hand-off's sake; the share
      // is still in flight, so stay busy until the sheet resolves.
      setStatus('generating');

      const canShareFiles =
        typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
      const method = canShareFiles && typeof navigator.share === 'function' ? 'native' : 'download';

      report('share_initiated', { method });

      if (method === 'native') {
        try {
          await navigator.share({ files: [file] });
          setStatus('success');
          // A native share sheet cannot prove a recipient received anything —
          // only that it opened. docs/posthog.md §11.7 requires that meaning to
          // be stated in the PostHog definition, not silently assumed here.
          report('share_completed', { method });
          return method;
        } catch (error) {
          // User dismissed the share sheet — not an error, and not a share.
          if (error && error.name === 'AbortError') {
            setStatus('idle');
          } else {
            setStatus('error');
          }
          return null;
        }
      }

      // Download fallback (desktop / unsupported).
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setStatus('success');
      report('share_completed', { method });
      return method;
    },
    [createImageFile]
  );

  return { createImageFile, shareImage, status };
}
