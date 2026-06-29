import { useEffect, useState } from 'react';

const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

export function useIsMobileDevice() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(TOUCH_QUERY).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(TOUCH_QUERY);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
