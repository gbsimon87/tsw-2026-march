import { useCallback, useRef, useState } from 'react';

// One save lock for the tracker. Writes may overlap by design (a mobile follow-up answer is
// submitted while its primary stat is still saving), so this counts holders instead of being
// a boolean: the UI stays locked until the last write settles. Handlers read the ref through
// isSavingNow(), because two clicks can arrive before React commits the isSaving state.
export function useSaveLock() {
  const holdersRef = useRef(0);
  const [isSaving, setIsSaving] = useState(false);

  const isSavingNow = useCallback(() => holdersRef.current > 0, []);

  // Returns an idempotent release, so a finally block and an early exit cannot double-release.
  const beginSave = useCallback(() => {
    holdersRef.current += 1;
    setIsSaving(true);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holdersRef.current -= 1;
      if (holdersRef.current === 0) setIsSaving(false);
    };
  }, []);

  return { isSaving, isSavingNow, beginSave };
}
