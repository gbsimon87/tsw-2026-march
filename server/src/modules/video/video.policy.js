// Mux game video — access policy (plan R1/R9; rulings P1–P4, E12).
//
// Pure-ish decision functions: each takes the game document the caller already
// loaded, performs only narrow repository reads, and RETURNS a decision object.
// A "no" is never thrown — only infrastructure errors (a failed DB read)
// propagate. Callers turn decisions into HTTP responses; the `reason` strings
// are stable machine values for logs, tests and (upload only, E8) payloads.
//
// Nothing here signs tokens, mounts routes or touches YouTube behaviour (E12).
//
// Consumers: T4 upload (resolveUploadAllowance) and cancel/remove
// (resolveVideoManagerAccess), T6 playback
// (resolveFullGamePlaybackAccess, resolveClipPlaybackAccess), T7 Pulse
// (canPublishMuxClips, isEventSubjectRestricted).
//
// Require graph: games.service and leagues.service are required LAZILY (inside
// the functions that use them). games.service will lazily require video
// modules from T4/T6 on, and both services sit high in the module graph; a
// load-time require from here would risk a cycle and pull the whole games
// stack into every video module. Repositories are leaves and load eagerly.

const { env } = require('../../config/env');
const { logger } = require('../../config/logger');
const { ApiError } = require('../../utils/apiError');
const { isMuxConfigured } = require('./mux.client');
const { resolveForLeague, resolveForTeam } = require('../billing/entitlements.service');
const {
  findLeagueVideoPolicyById,
  findActiveLeagueManager,
} = require('../leagues/leagues.repository');
const { findTeamBillingStateById } = require('../teams/teams.repository');
const { findLiveHighlightClipPost } = require('../feed/feed.repository');

function gamesService() {
  return require('../games/games.service');
}

function leaguesService() {
  return require('../leagues/leagues.service');
}

const UPLOAD_ALLOWANCE_REASONS = Object.freeze({
  HOSTING_DISABLED: 'hosting_disabled',
  UNAUTHENTICATED: 'unauthenticated',
  NOT_LEAGUE_GAME: 'not_league_game',
  LEAGUE_NOT_FOUND: 'league_not_found',
  NOT_LEAGUE_MANAGER: 'not_league_manager',
  LEAGUE_NOT_GRANTED: 'league_not_granted',
});

const FULL_GAME_ACCESS_REASONS = Object.freeze({
  UNAUTHENTICATED: 'unauthenticated',
  GAME_NOT_FOUND: 'game_not_found',
  NO_GAME_ACCESS: 'no_game_access',
  REPLAY_NOT_ENTITLED: 'replay_not_entitled',
});

// Shared by resolveClipPlaybackAccess and canPublishMuxClips (the publication
// gate is the same; only the clip path adds the event, share and subject checks).
const CLIP_ACCESS_REASONS = Object.freeze({
  GAME_NOT_FOUND: 'game_not_found',
  EVENT_NOT_FOUND: 'event_not_found',
  PUBLIC_CLIPS_DISABLED: 'public_clips_disabled',
  NOT_LEAGUE_GAME: 'not_league_game',
  GAME_NOT_COMPLETED: 'game_not_completed',
  LEAGUE_NOT_FOUND: 'league_not_found',
  PUBLICATION_NOT_GRANTED: 'publication_not_granted',
  LEAGUE_NOT_PUBLIC: 'league_not_public',
  SHARE_NOT_FOUND: 'share_not_found',
  MARKETING_NOT_PERMITTED: 'marketing_not_permitted',
  PLAYER_RESTRICTED: 'player_restricted',
  PLAYER_UNKNOWN: 'player_unknown',
});

// Mirrors the League.videoHosting schema defaults (leagues.repository.js). A
// lean read has no defaults, so a grant written without a limit field reads
// the same limit a hydrated document would.
const HOSTING_LIMIT_DEFAULTS = Object.freeze({
  maxStoredMinutes: 0,
  maxConcurrentUploads: 1,
  maxCreatesPerDay: 3,
});

function readHostingLimits(hosting) {
  const limits = {};
  for (const [key, fallback] of Object.entries(HOSTING_LIMIT_DEFAULTS)) {
    const value = hosting?.[key];
    limits[key] = Number.isInteger(value) && value >= 0 ? value : fallback;
  }
  return limits;
}

function isLeagueGame(game) {
  return Boolean(game && game.gameContext === 'league' && game.leagueId);
}

function findGameEvent(game, eventId) {
  if (eventId === null || eventId === undefined) return null;
  const id = String(eventId);
  return (game?.events || []).find((event) => String(event?._id) === id) || null;
}

// canAccessGame reaches leagues.service.canManageLeagueGame, which throws
// ApiError(404) when the game's League no longer exists. That is a "no", not
// an infrastructure failure.
async function viewerCanAccessGame(userId, game) {
  try {
    return Boolean(await gamesService().canAccessGame(userId, game));
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) return false;
    throw error;
  }
}

// ─── P1 upload allowance ─────────────────────────────────────────────────────

const deniedUpload = (reason) => ({ allowed: false, reason, billingResource: null, limits: null });

// League owner or ACTIVE league manager only — team managers are excluded in
// v1 (the canFinalizeLeagueGame level, read from the League we hold).
async function isLeagueOwnerOrManager(league, game, userId) {
  if (String(league.ownerUserId) === String(userId)) return true;
  return Boolean(await findActiveLeagueManager(game.leagueId, userId));
}

/**
 * P1 conditions 1, 2, 4 and 5 for a hosted (Mux) upload.
 *
 * Condition 3 — writable game access — is NOT checked here: the caller (T4)
 * must also run `assertGameAccess(userId, gameId, { requireWritable: true })`,
 * which additionally enforces an active/trialing/comp League subscription.
 *
 * @param {object} input
 * @param {string|ObjectId|null} input.userId authenticated uploader
 * @param {object} input.game Game document or lean object (gameContext, leagueId, status)
 * @param {Date} [input.now] accepted for interface stability; no time-based rule yet
 * @returns {Promise<{allowed: boolean, reason: string|null,
 *   billingResource: {type: 'league', id: string}|null,
 *   limits: {maxStoredMinutes: number, maxConcurrentUploads: number, maxCreatesPerDay: number}|null}>}
 *   `billingResource` and `limits` are non-null exactly when `allowed` (P2: the
 *   League pays; standalone games have no hosted upload in v1).
 */
async function resolveUploadAllowance({ userId, game } = {}) {
  const R = UPLOAD_ALLOWANCE_REASONS;
  if (!isMuxConfigured() || env.MUX_UPLOADS_ENABLED !== true) {
    return deniedUpload(R.HOSTING_DISABLED);
  }
  if (!userId) return deniedUpload(R.UNAUTHENTICATED);
  if (!isLeagueGame(game)) return deniedUpload(R.NOT_LEAGUE_GAME);

  const league = await findLeagueVideoPolicyById(game.leagueId);
  if (!league) return deniedUpload(R.LEAGUE_NOT_FOUND);
  if (!(await isLeagueOwnerOrManager(league, game, userId))) {
    return deniedUpload(R.NOT_LEAGUE_MANAGER);
  }

  // Missing videoHosting (lean read of a League saved before the field) or any
  // non-boolean value is closed.
  if (league.videoHosting?.enabled !== true) return deniedUpload(R.LEAGUE_NOT_GRANTED);

  return {
    allowed: true,
    reason: null,
    billingResource: { type: 'league', id: String(game.leagueId) },
    limits: readHostingLimits(league.videoHosting),
  };
}

/**
 * Who may cancel an upload or remove hosted media (T4): the league owner or an
 * active league manager — the P1 uploader set — WITHOUT the hosting gates
 * (env flag, grant, game status), so media can always be removed even after
 * hosting is switched off. The caller also runs `assertGameAccess(userId,
 * gameId)` — game access only, NOT requireWritable (controller ruling: a
 * lapsed League must still be able to take media down).
 * Reasons are UPLOAD_ALLOWANCE_REASONS values (unauthenticated,
 * not_league_game, league_not_found, not_league_manager).
 *
 * @param {object} input
 * @param {string|ObjectId|null} input.userId
 * @param {object} input.game Game document or lean object
 * @returns {Promise<{allowed: boolean, reason: string|null}>}
 */
async function resolveVideoManagerAccess({ userId, game } = {}) {
  const R = UPLOAD_ALLOWANCE_REASONS;
  if (!userId) return { allowed: false, reason: R.UNAUTHENTICATED };
  if (!isLeagueGame(game)) return { allowed: false, reason: R.NOT_LEAGUE_GAME };
  const league = await findLeagueVideoPolicyById(game.leagueId);
  if (!league) return { allowed: false, reason: R.LEAGUE_NOT_FOUND };
  if (!(await isLeagueOwnerOrManager(league, game, userId))) {
    return { allowed: false, reason: R.NOT_LEAGUE_MANAGER };
  }
  return { allowed: true, reason: null };
}

// ─── Narrow live billing read ────────────────────────────────────────────────

/**
 * Live `canViewReplay` for a game, from the narrowest billing documents — NOT
 * via resolveGameTeamContext, which repairs roster snapshots and hydrates
 * rosters (R1).
 *
 * - League game: the League (entitlements.resolveForLeague). A missing League
 *   resolves false.
 * - Standalone game: every Team the game names (teamId, homeTeamId,
 *   awayTeamId, de-duplicated). Dual-team rule: EITHER surviving side granting
 *   replay is enough. Every team plan grants replay today (plan-catalog.js
 *   TEAM_ENTITLEMENTS on starter and team_extra; inactive subscriptions fall
 *   back to starter), so this equals "a team still exists" and never depends
 *   on which side the viewer is on. If replay is ever paywalled, revisit this
 *   to read the viewer's owned side. No surviving Team resolves false.
 *
 * @param {object} game Game document or lean object
 * @param {object} [options]
 * @param {object} [options.league] a League already read with
 *   findLeagueVideoPolicyById (avoids a second read)
 * @returns {Promise<boolean>}
 */
async function resolveGameReplayEntitlement(game, { league } = {}) {
  if (!game) return false;

  if (game.gameContext === 'league') {
    const leagueDoc = league || (await findLeagueVideoPolicyById(game.leagueId));
    if (!leagueDoc) return false;
    return resolveForLeague(leagueDoc).entitlements.canViewReplay === true;
  }

  const teamIds = [
    ...new Set([game.teamId, game.homeTeamId, game.awayTeamId].filter(Boolean).map(String)),
  ];
  for (const teamId of teamIds) {
    const team = await findTeamBillingStateById(teamId);
    if (team && resolveForTeam(team).entitlements.canViewReplay === true) return true;
  }
  return false;
}

// ─── P3 full-game playback ───────────────────────────────────────────────────

/**
 * P3: who may receive a full-game playback token.
 *
 * Anonymous → 401. No game, or a viewer without `canAccessGame` (owner,
 * standalone dual-team owners, league owner / league manager / team manager)
 * → 404. Live replay entitlement false → 403. Claimed players and plain league
 * members are excluded in v1. Never uses assertGameAccess's null-user path.
 *
 * @param {object} input
 * @param {string|ObjectId|null} input.userId
 * @param {object|null} input.game Game document the caller loaded by id
 * @returns {Promise<{allowed: boolean, status: 200|401|403|404, reason: string|null}>}
 */
async function resolveFullGamePlaybackAccess({ userId, game } = {}) {
  const R = FULL_GAME_ACCESS_REASONS;
  if (!userId) return { allowed: false, status: 401, reason: R.UNAUTHENTICATED };
  if (!game) return { allowed: false, status: 404, reason: R.GAME_NOT_FOUND };
  if (!(await viewerCanAccessGame(userId, game))) {
    return { allowed: false, status: 404, reason: R.NO_GAME_ACCESS };
  }
  if (!(await resolveGameReplayEntitlement(game))) {
    return { allowed: false, status: 403, reason: R.REPLAY_NOT_ENTITLED };
  }
  return { allowed: true, status: 200, reason: null };
}

// ─── P4 publication gate ─────────────────────────────────────────────────────

// Every id a roster row may be known by: an event's playerId is the snapshot
// row `_id`, which equals the leaguePlayerId on current games
// (withStableSnapshotIds) but not on older ones, while restrictedPlayerIds
// (buildGameMarketing → listLeaguePlayers) are LeaguePlayer ids.
function subjectIdentities(game, playerId) {
  const id = String(playerId);
  const ids = new Set([id]);
  for (const roster of [game?.rosterSnapshot, game?.homeRosterSnapshot, game?.awayRosterSnapshot]) {
    if (!Array.isArray(roster)) continue;
    for (const row of roster) {
      const rowIds = [row?._id, row?.leaguePlayerId, row?.sourcePlayerId]
        .filter(Boolean)
        .map(String);
      if (rowIds.includes(id)) rowIds.forEach((rowId) => ids.add(rowId));
    }
  }
  return ids;
}

function eventSubjectRestriction(game, event, restrictedPlayerIds) {
  // The scorer must be identifiable to be cleared; an unattributed event
  // cannot be checked against anyone's restriction.
  if (!event || !event.playerId) return CLIP_ACCESS_REASONS.PLAYER_UNKNOWN;
  const restricted = new Set((restrictedPlayerIds || []).map(String));
  // R9 "everyone filmed": the related player (assister, fouler, ...) counts too.
  for (const subject of [event.playerId, event.relatedPlayerId].filter(Boolean)) {
    for (const id of subjectIdentities(game, subject)) {
      if (restricted.has(id)) return CLIP_ACCESS_REASONS.PLAYER_RESTRICTED;
    }
  }
  return null;
}

/**
 * True when an event's footage may NOT be published: its scorer or related
 * player is in `restrictedPlayerIds`, or it names no scorer. Pure. T7 uses it
 * per event after one canPublishMuxClips call per game.
 *
 * @param {object} input
 * @param {object} input.game Game (roster snapshots map event ids to LeaguePlayer ids)
 * @param {object|null} input.event a game event ({ playerId, relatedPlayerId })
 * @param {string[]} input.restrictedPlayerIds from canPublishMuxClips / buildGameMarketing
 * @returns {boolean}
 */
function isEventSubjectRestricted({ game, event, restrictedPlayerIds } = {}) {
  return eventSubjectRestriction(game, event, restrictedPlayerIds) !== null;
}

// Env lock, game shape, footage grant and live visibility — everything that
// needs at most the League read (plus isLeaguePublic's own live read).
async function checkPublicationLocks(game, preloadedLeague) {
  const R = CLIP_ACCESS_REASONS;
  if (env.MUX_PUBLIC_CLIPS_ENABLED !== true) return { reason: R.PUBLIC_CLIPS_DISABLED };
  if (!game) return { reason: R.GAME_NOT_FOUND };
  if (!isLeagueGame(game)) return { reason: R.NOT_LEAGUE_GAME };
  if (game.status !== 'completed') return { reason: R.GAME_NOT_COMPLETED };

  const league = preloadedLeague || (await findLeagueVideoPolicyById(game.leagueId));
  if (!league) return { reason: R.LEAGUE_NOT_FOUND };
  // Missing videoHosting/publicClips on a lean read is closed.
  if (league.videoHosting?.publicClips?.status !== 'granted') {
    return { reason: R.PUBLICATION_NOT_GRANTED };
  }
  // Live: a league turned private (or archived) stops public clips at the next
  // signing even though user-authored shares survive the privacy flip.
  if (!(await leaguesService().isLeaguePublic(game.leagueId))) {
    return { reason: R.LEAGUE_NOT_PUBLIC };
  }
  return { reason: null, league };
}

// strict: a failed LeagueTeam/LeaguePlayer read must throw, never degrade to
// "no restricted players" while canFeature stays true (R9 fail closed).
async function checkMarketing(game, league) {
  const marketing = await gamesService().buildGameMarketing(game, { league, strict: true });
  if (marketing?.canFeature !== true) {
    return { reason: CLIP_ACCESS_REASONS.MARKETING_NOT_PERMITTED, restrictedPlayerIds: [] };
  }
  return { reason: null, restrictedPlayerIds: (marketing.restrictedPlayerIds || []).map(String) };
}

/**
 * P4 publication gate for Mux clips WITHOUT the per-share lookup — for T7's
 * auto-post and manual-share gating. Requires: env MUX_PUBLIC_CLIPS_ENABLED;
 * league game; status `completed`; League.videoHosting.publicClips.status
 * `granted`; isLeaguePublic; buildGameMarketing(...).canFeature. The per-event
 * player restriction is left to the caller via isEventSubjectRestricted with
 * the returned `restrictedPlayerIds`. YouTube clips are not gated by this.
 *
 * @param {object} input
 * @param {object} input.game Game document
 * @param {object} [input.league] League from findLeagueVideoPolicyById (else read)
 * @param {Date} [input.now] accepted for interface stability; no time-based rule yet
 * @returns {Promise<{allowed: boolean, reason: string|null, restrictedPlayerIds: string[]}>}
 */
async function canPublishMuxClips({ game, league } = {}) {
  const locks = await checkPublicationLocks(game, league);
  if (locks.reason) return { allowed: false, reason: locks.reason, restrictedPlayerIds: [] };

  const marketing = await checkMarketing(game, locks.league);
  if (marketing.reason)
    return { allowed: false, reason: marketing.reason, restrictedPlayerIds: [] };

  return { allowed: true, reason: null, restrictedPlayerIds: marketing.restrictedPlayerIds };
}

// ─── P4 clip playback ────────────────────────────────────────────────────────

/**
 * P4: who may receive a clip playback token for one event.
 *
 * - Manager audience: an authenticated viewer with `canAccessGame` is always
 *   allowed (no publication locks), provided the event exists on the game.
 * - Public audience (anyone else, signed in or not): the event exists AND the
 *   canPublishMuxClips gate passes AND a live `highlight_clip` post matches
 *   BOTH {gameId, eventId} AND the event's scorer/related player is not
 *   restricted. All checked live at every signing.
 *
 * Every denial is 401 when signed out and 404 when signed in; the
 * client never learns which check failed — `reason` is for logs/tests only.
 * Timeline/playability of the event's videoTimestamp is the caller's (T6) job.
 *
 * @param {object} input
 * @param {string|ObjectId|null} input.userId
 * @param {object|null} input.game Game document the caller loaded by id
 * @param {string|ObjectId} input.eventId the game event the clip shows
 * @param {Date} [input.now] accepted for interface stability; no time-based rule yet
 * @returns {Promise<{allowed: boolean, status: 200|401|404, reason: string|null,
 *   audience: 'manager'|'public'|null}>}
 */
async function resolveClipPlaybackAccess({ userId, game, eventId } = {}) {
  const R = CLIP_ACCESS_REASONS;
  const deny = (reason) => ({
    allowed: false,
    status: userId ? 404 : 401,
    reason,
    audience: null,
  });

  if (!game) return deny(R.GAME_NOT_FOUND);
  const event = findGameEvent(game, eventId);

  if (userId && (await viewerCanAccessGame(userId, game))) {
    if (!event) return deny(R.EVENT_NOT_FOUND);
    return { allowed: true, status: 200, reason: null, audience: 'manager' };
  }

  if (!event) return deny(R.EVENT_NOT_FOUND);

  const locks = await checkPublicationLocks(game, null);
  if (locks.reason) return deny(locks.reason);

  const share = await findLiveHighlightClipPost({ gameId: game._id, eventId: String(eventId) });
  if (!share) return deny(R.SHARE_NOT_FOUND);

  const marketing = await checkMarketing(game, locks.league);
  if (marketing.reason) return deny(marketing.reason);

  const restriction = eventSubjectRestriction(game, event, marketing.restrictedPlayerIds);
  if (restriction) return deny(restriction);

  return { allowed: true, status: 200, reason: null, audience: 'public' };
}

/**
 * V15: for list payloads (profile highlights, Pulse), whether THIS viewer
 * could receive a clip token for a game's events — resolved once per game.
 * Mirrors resolveClipPlaybackAccess except the live-share lookup, which the
 * caller already has (a Pulse post, or its shared-event set). Read failures
 * fail closed: the highlight shows as unavailable rather than dropping the page.
 *
 * @param {object} input
 * @param {string|ObjectId|null} input.userId
 * @param {object} input.game full Game document (rosters, league ids, status)
 * @returns {Promise<(event: object, hasLiveShare: boolean) => boolean>} the
 *   public audience additionally needs a live share of that event
 */
async function resolveMuxHighlightViewerGate({ userId, game } = {}) {
  try {
    if (userId && (await viewerCanAccessGame(userId, game))) return () => true;
    const permission = await canPublishMuxClips({ game });
    if (!permission.allowed) return () => false;
    return (event, hasLiveShare) =>
      hasLiveShare === true &&
      eventSubjectRestriction(game, event, permission.restrictedPlayerIds) === null;
  } catch (error) {
    logger.warn(
      { gameId: game?._id ? String(game._id) : null, err: error?.message },
      'Mux highlight visibility check failed; hiding the clip'
    );
    return () => false;
  }
}

module.exports = {
  UPLOAD_ALLOWANCE_REASONS,
  FULL_GAME_ACCESS_REASONS,
  CLIP_ACCESS_REASONS,
  resolveUploadAllowance,
  resolveVideoManagerAccess,
  resolveGameReplayEntitlement,
  resolveFullGamePlaybackAccess,
  resolveClipPlaybackAccess,
  resolveMuxHighlightViewerGate,
  canPublishMuxClips,
  isEventSubjectRestricted,
};
