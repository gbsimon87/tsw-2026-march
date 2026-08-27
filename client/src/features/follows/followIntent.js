import { isSafeInternalPath } from '../../lib/safeRedirect';

export const PENDING_FOLLOW_KEY = 'tsw_pending_follow';

export function readPendingFollowIntent() {
  try {
    const intent = JSON.parse(sessionStorage.getItem(PENDING_FOLLOW_KEY) || 'null');
    if (!intent || !['user', 'league', 'leagueTeam'].includes(intent.targetType)) return null;
    if (!intent.targetId) return null;
    if (!isSafeInternalPath(intent.returnTo)) return null;
    return intent;
  } catch {
    sessionStorage.removeItem(PENDING_FOLLOW_KEY);
    return null;
  }
}
