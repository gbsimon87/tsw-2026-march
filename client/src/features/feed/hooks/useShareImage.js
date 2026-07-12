import { useCallback, useState } from 'react';
import html2canvas from 'html2canvas';

// Capture a DOM node to a branded PNG and hand it to the OS share sheet,
// falling back to a download when Web Share (with files) is unavailable.
// Knows nothing about the domain — it shares whatever node it is given.
export function useShareImage() {
  const [status, setStatus] = useState('idle');

  const shareImage = useCallback(async (node, fileName) => {
    if (!node) return;
    setStatus('generating');

    let blob;
    try {
      const canvas = await html2canvas(node, {
        backgroundColor: null,
        useCORS: true,
        scale: 2,
        logging: false,
      });
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Failed to produce image blob');
    } catch {
      setStatus('error');
      return;
    }

    const file = new File([blob], fileName, { type: 'image/png' });

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
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('success');
  }, []);

  return { shareImage, status };
}
