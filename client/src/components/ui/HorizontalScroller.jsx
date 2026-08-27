import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A horizontally scrollable region that says so.
 *
 * `overflow-x-auto` on its own gives no signal: the content at the boundary
 * just looks cut off. Both the recap card rows and the league standings table
 * were read during the audit as broken layouts when they were simply scrolled.
 * Fading whichever edge still has content beyond it names the direction, and
 * clears itself once there is nothing further to reach.
 *
 * `fadeColor` matches the surface the scroller sits on, so the fade blends
 * instead of drawing a grey bar.
 */
export function HorizontalScroller({
  children,
  className = '',
  innerClassName = '',
  fadeColor = 'white',
}) {
  const scrollerRef = useRef(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const maxScroll = node.scrollWidth - node.clientWidth;
    setEdges({
      start: node.scrollLeft > 1,
      end: maxScroll > 1 && node.scrollLeft < maxScroll - 1,
    });
  }, []);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return undefined;

    measure();
    node.addEventListener('scroll', measure, { passive: true });

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => {
        node.removeEventListener('scroll', measure);
        window.removeEventListener('resize', measure);
      };
    }

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      node.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure]);

  return (
    <div className={`relative ${className}`}>
      <div ref={scrollerRef} className={`overflow-x-auto ${innerClassName}`}>
        {children}
      </div>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 left-0 w-8 transition-opacity duration-200 ${
          edges.start ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ backgroundImage: `linear-gradient(to right, ${fadeColor}, transparent)` }}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 right-0 w-8 transition-opacity duration-200 ${
          edges.end ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ backgroundImage: `linear-gradient(to left, ${fadeColor}, transparent)` }}
      />
    </div>
  );
}
