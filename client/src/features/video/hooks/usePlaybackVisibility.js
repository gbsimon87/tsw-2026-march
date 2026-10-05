import { useEffect, useRef, useState } from 'react';
export function usePlaybackVisibility(threshold = 0.5) {
  const containerRef = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    let intersecting = false;
    const update = () => setVisible(intersecting && document.visibilityState !== 'hidden');
    const observer = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry.isIntersecting && entry.intersectionRatio >= threshold;
        update();
      },
      { threshold }
    );
    observer.observe(el);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [threshold]);
  return { containerRef, visible };
}
