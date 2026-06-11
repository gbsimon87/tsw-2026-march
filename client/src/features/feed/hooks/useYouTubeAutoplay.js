import { useEffect, useRef } from 'react';

// Module-level singleton — only one YouTube iframe plays at a time across all instances.
let activeIframe = null;

function sendCommand(iframe, func) {
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
}

function activateIframe(iframe) {
  if (activeIframe && activeIframe !== iframe) {
    sendCommand(activeIframe, 'pauseVideo');
  }
  activeIframe = iframe;
  sendCommand(iframe, 'playVideo');
}

export function useYouTubeAutoplay({ threshold = 0.5 } = {}) {
  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  const pendingPlay = useRef(false);
  const isLoaded = useRef(false);
  const thresholdRef = useRef(threshold);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    function onLoad() {
      isLoaded.current = true;
      if (pendingPlay.current) activateIframe(iframe);
    }

    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    const iframe = iframeRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          pendingPlay.current = true;
          if (isLoaded.current) activateIframe(iframe);
        } else {
          pendingPlay.current = false;
          if (activeIframe === iframe) activeIframe = null;
          sendCommand(iframe, 'pauseVideo');
        }
      },
      { threshold: thresholdRef.current }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      if (activeIframe === iframe) activeIframe = null;
    };
  }, []);

  return { containerRef, iframeRef };
}
