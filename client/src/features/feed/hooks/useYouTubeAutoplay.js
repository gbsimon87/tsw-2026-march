import { useEffect, useRef } from 'react';

// Module-level singleton — only one YouTube iframe plays at a time across all instances.
// WeakRef prevents stale detached DOM nodes from blocking GC.
let activeIframeRef = null;

function getActiveIframe() {
  return activeIframeRef?.deref() ?? null;
}

function sendCommand(iframe, func) {
  if (!iframe?.contentWindow || !iframe.isConnected) return;
  iframe.contentWindow.postMessage(
    JSON.stringify({ event: 'command', func, args: [] }),
    'https://www.youtube.com'
  );
}

function activateIframe(iframe) {
  const current = getActiveIframe();
  if (current && current !== iframe) {
    sendCommand(current, 'pauseVideo');
  }
  activeIframeRef = new WeakRef(iframe);
  sendCommand(iframe, 'playVideo');
}

function clearActiveIframe(iframe) {
  if (getActiveIframe() === iframe) activeIframeRef = null;
}

export function useYouTubeAutoplay({ src, threshold = 0.5 } = {}) {
  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  const pendingPlay = useRef(false);
  const isLoaded = useRef(false);
  const srcLoaded = useRef(false);
  const thresholdRef = useRef(threshold);
  const srcRef = useRef(src);

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
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    const iframe = iframeRef.current;
    if (!el) return;

    // Reset lazy-load flag so Strict Mode double-invoke re-sets the src correctly.
    srcLoaded.current = false;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          pendingPlay.current = true;
          if (!srcLoaded.current && iframe && srcRef.current) {
            srcLoaded.current = true;
            iframe.src = srcRef.current;
            // onLoad fires after src resolves; it calls activateIframe.
          } else if (isLoaded.current) {
            activateIframe(iframe);
          }
        } else {
          pendingPlay.current = false;
          clearActiveIframe(iframe);
          sendCommand(iframe, 'pauseVideo');
        }
      },
      { threshold: thresholdRef.current }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      clearActiveIframe(iframe);
      srcLoaded.current = false;
    };
  }, []);

  return { containerRef, iframeRef };
}
