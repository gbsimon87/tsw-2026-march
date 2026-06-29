import { useEffect, useRef } from 'react';

const THRESHOLDS = [25, 50, 75, 100];

/**
 * Tracks how far down the page the user scrolls (25/50/75/100%) and fires
 * a callback for each threshold reached. Resets when the route changes.
 *
 * @param {(depth: number) => void} onDepthReached
 * @param {string} routeKey - reset trigger (pass location.pathname + location.search)
 */
export function useScrollDepth(onDepthReached, routeKey) {
  const reachedRef = useRef(new Set());
  const callbackRef = useRef(onDepthReached);
  callbackRef.current = onDepthReached;

  useEffect(() => {
    reachedRef.current = new Set();
  }, [routeKey]);

  useEffect(() => {
    function handleScroll() {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;

      const pct = Math.round((scrollTop / docHeight) * 100);

      for (const threshold of THRESHOLDS) {
        if (pct >= threshold && !reachedRef.current.has(threshold)) {
          reachedRef.current.add(threshold);
          callbackRef.current(threshold);
        }
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
}
