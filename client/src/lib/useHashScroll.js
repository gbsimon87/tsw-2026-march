import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// ~1s at 60fps: long enough for a route chunk to arrive on a cold load, short
// enough that a genuinely missing id does not leave a loop running.
const MAX_FRAMES = 60;

// Restores fragment links, which this app silently loses.
//
// Every route is a lazy() chunk, so on a cold load the browser looks for #hash,
// finds only the Suspense fallback, and gives up. Measured on /privacy: without
// this, the browser leaves scrollY at 0 with the target 2738px down the page.
//
// That is not just a papercut. Meta App Review requires a data-deletion
// instructions URL, TSW's is /privacy#data-deletion, and a reviewer who lands on
// the wrong section can fail the submission.
//
// Retries across frames rather than waiting on a fixed timer, because how long
// the chunk takes depends on the network.
export function useHashScroll() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return undefined;

    const id = decodeURIComponent(hash.slice(1));
    let frame = 0;
    let attempts = 0;

    const scrollToTarget = () => {
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView();
        return;
      }
      if (attempts < MAX_FRAMES) {
        attempts += 1;
        frame = requestAnimationFrame(scrollToTarget);
      }
    };

    frame = requestAnimationFrame(scrollToTarget);
    return () => cancelAnimationFrame(frame);
  }, [hash]);
}
