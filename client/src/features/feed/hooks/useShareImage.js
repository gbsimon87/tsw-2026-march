import { useCallback, useState } from 'react';
import html2canvas from 'html2canvas';

// Rasterises an off-screen ShareableCardExport node, then either hands the file
// to the OS share sheet or downloads it.
//
// The node carries its own capture scale in `data-capture-scale`: the honours
// board is already composed at 1080x1350 and only needs 2x for crispness, while
// the game card is laid out at feed scale and relies on the capture to enlarge
// it onto 1080x1350 exactly. One hard-coded scale here would silently produce a
// game-card PNG at the wrong size for the Instagram 4:5 check.
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

  const shareImage = useCallback(
    async (node, fileName) => {
      const file = await createImageFile(node, fileName);
      if (!file) return;
      // createImageFile settles on 'success' for the hand-off's sake; the share
      // is still in flight, so stay busy until the sheet resolves.
      setStatus('generating');

      const canShareFiles =
        typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

      if (canShareFiles && typeof navigator.share === 'function') {
        try {
          await navigator.share({ files: [file] });
          setStatus('success');
        } catch (error) {
          // User dismissed the share sheet — not an error.
          if (error && error.name === 'AbortError') {
            setStatus('idle');
          } else {
            setStatus('error');
          }
        }
        return;
      }

      // Download fallback (desktop / unsupported).
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus('success');
    },
    [createImageFile]
  );

  return { createImageFile, shareImage, status };
}
