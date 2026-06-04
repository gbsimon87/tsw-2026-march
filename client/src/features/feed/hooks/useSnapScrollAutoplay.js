import { useEffect, useRef } from 'react';

/**
 * Attaches an IntersectionObserver to a scroll container and plays/pauses
 * <video> elements as their slide enters/leaves the viewport.
 */
export function useSnapScrollAutoplay(containerRef) {
  const observerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target.querySelector('video');
          if (!video) continue;

          if (entry.isIntersecting) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        }
      },
      {
        root: container,
        threshold: 0.6,
      }
    );

    const slides = container.querySelectorAll('[data-feed-slide]');
    for (const slide of slides) {
      observerRef.current.observe(slide);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [containerRef]);

  // Re-observe when slides change (pagination)
  function observeSlide(el) {
    if (el && observerRef.current) {
      observerRef.current.observe(el);
    }
  }

  return { observeSlide };
}
