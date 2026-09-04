import { useEffect } from 'react';
import { trackEvent } from '../../analytics/trackEvent';
import { isKnownCourtLayoutId, resolveCourtLayout } from './courtLayouts';

const reportedIds = new Set();

// Resolves a game's stored layout id to its registry entry, reporting ids that
// are present but unrecognised. An ABSENT id is not an error - it is the
// durable legacy-v1 discriminator for games created before versioning - so only
// a non-empty unknown value is reported, once per id per session.
export function useCourtLayout(courtLayoutId) {
  useEffect(() => {
    if (!courtLayoutId || isKnownCourtLayoutId(courtLayoutId)) {
      return;
    }

    if (reportedIds.has(courtLayoutId)) {
      return;
    }

    reportedIds.add(courtLayoutId);
    console.error('Unknown court layout id; rendering with the legacy court', { courtLayoutId });
    trackEvent('court_layout_unknown', { court_layout_id: String(courtLayoutId) });
  }, [courtLayoutId]);

  return resolveCourtLayout(courtLayoutId);
}
