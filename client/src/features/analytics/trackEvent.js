import { capturePostHogEvent } from '../../lib/posthog';
import { parseBrowserEvent } from './analyticsContract';

export function trackEvent(event, properties = {}) {
  const parsed = parseBrowserEvent(event, properties);
  if (!parsed) return false;

  return capturePostHogEvent(event, parsed);
}
