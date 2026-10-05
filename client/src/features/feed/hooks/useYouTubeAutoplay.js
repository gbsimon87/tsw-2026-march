import { useEffect, useRef } from 'react';

import { activatePlayback, releasePlayback } from '../../video/playbackCoordinator';

function sendCommand(iframe, func) {
  if (!iframe?.contentWindow || !iframe.isConnected) return;
  iframe.contentWindow.postMessage(
    JSON.stringify({ event: 'command', func, args: [] }),
    'https://www.youtube.com'
  );
}

function activateIframe(iframe) {
  if (!iframe) return;
  activatePlayback(iframe, () => sendCommand(iframe, 'pauseVideo'));
  sendCommand(iframe, 'playVideo');
}
function clearActiveIframe(iframe) {
  releasePlayback(iframe);
}

export function useYouTubeAutoplay({ src, threshold = 0.5 } = {}) {
  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  const pendingPlay = useRef(false);
  const isLoaded = useRef(false);
  const srcLoaded = useRef(false);
  const srcRef = useRef(src);
  srcRef.current = src;

  // Listen for iframe load — fires after src is set lazily.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    function onLoad() {
      isLoaded.current = true;
      if (pendingPlay.current) activateIframe(iframe);
    }

    iframe.addEventListener('load', onLoad);
    return () => {
      iframe.removeEventListener('load', onLoad);
      isLoaded.current = false;
    };
  }, [src]);

  useEffect(() => {
    const el = containerRef.current;
    const iframe = iframeRef.current;
    if (!el) return;

    // Reset lazy-load flag so Strict Mode double-invoke re-sets the src correctly.
    srcLoaded.current = false;

    let intersecting = false;
    const update = () => {
      if (intersecting && document.visibilityState !== 'hidden') {
        pendingPlay.current = true;
        if (!srcLoaded.current && iframe && srcRef.current) {
          srcLoaded.current = true;
          iframe.src = srcRef.current;
        } else if (isLoaded.current) activateIframe(iframe);
      } else {
        pendingPlay.current = false;
        clearActiveIframe(iframe);
        sendCommand(iframe, 'pauseVideo');
      }
    };
    document.addEventListener('visibilitychange', update);
    const observer = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry.isIntersecting && entry.intersectionRatio >= threshold;
        update();
      },
      { threshold }
    );

    observer.observe(el);

    return () => {
      document.removeEventListener('visibilitychange', update);
      observer.disconnect();
      clearActiveIframe(iframe);
      sendCommand(iframe, 'pauseVideo');
      srcLoaded.current = false;
    };
  }, [src, threshold]);

  return { containerRef, iframeRef };
}
