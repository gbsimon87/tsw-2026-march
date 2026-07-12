const mongoose = require('mongoose');
const { ApiError } = require('../../utils/apiError');
const { buildCursorPage } = require('../../utils/pagination');
const { transformCloudinaryUrl } = require('../shared/cloudinaryUrl');
const { findUserById, findUsersByIds } = require('../auth/auth.repository');
const {
  assembleLeagueProfilesForUser,
  assertLeagueVisible,
} = require('../leagues/leagues.service');
const { listLeaguesByIds, listLeagueTeamsByIds } = require('../leagues/leagues.repository');
const {
  createFollow,
  deleteFollow,
  listFollowingByUser,
  findFollowedTargetIds,
} = require('./follows.repository');

// Follow System v1.5. Follows are polymorphic over `targetType`. Each type
// supplies a handler (below) with three responsibilities:
//   validateId(id)                     -> throws ApiError(404) on a malformed id
//   assertFollowable(id, viewerUserId) -> throws ApiError(404) if the target is
//       missing or not visible to this viewer; league/leagueTeam gate visibility
//       by REUSING assertLeagueVisible (never a hand-rolled isPublic check —
//       PROJECT-KNOWLEDGE.md §4 / follow-system decision D8)
//   hydrateMany(rows, viewerUserId)    -> batch-fetch + shape the following-list
//       entries for this type (no N+1). For league/leagueTeam this re-checks
//       CURRENT visibility and nulls profileHref server-side for now-private
//       targets (D8), keeping the follow row durable (D5).
// follow/unfollow/list/status stay type-generic and dispatch through the map.
const TARGET_TYPES = { USER: 'user', LEAGUE: 'league', LEAGUE_TEAM: 'leagueTeam' };

function assertValidObjectId(id, message) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, message);
  }
}

function assertValidUserId(userId) {
  assertValidObjectId(userId, 'User not found');
}

// A user has a public profile if they own at least one claimed league-player
// in a *public* league — the same condition getPublicUserProfiles uses to
// decide whether GET /public/players/:userId returns 200 or 404. Reusing the
// shared assembler keeps the "does /players/:userId exist?" answer in one place.
async function userHasPublicProfile(userId) {
  const profiles = await assembleLeagueProfilesForUser(userId);
  return profiles.some((profile) => profile.league?.isPublic === true);
}

// --- user handler --------------------------------------------------------

async function assertUserFollowable(targetUserId, followerUserId) {
  assertValidUserId(targetUserId);

  // Self-follow is only meaningful (and only blocked) for user accounts —
  // following your own league/team is legitimate (decision DL3).
  if (String(followerUserId) === String(targetUserId)) {
    throw new ApiError(400, 'You cannot follow yourself');
  }

  const target = await findUserById(targetUserId);
  if (!target) {
    throw new ApiError(404, 'User not found');
  }
  return target;
}

async function hydrateUsers(rows) {
  const targetIds = rows.map((row) => String(row.targetId));
  const users = await findUsersByIds(targetIds);
  const usersById = new Map(users.map((user) => [String(user._id), user]));

  // Durable follow (D5): a deleted account simply drops out of the hydrated
  // list. Fan the per-user public-profile check out in parallel — each is a few
  // DB round trips, so a sequential loop would serialize a page of N follows.
  const hydratedUsers = rows.map((row) => usersById.get(String(row.targetId))).filter(Boolean);
  const publicProfileFlags = await Promise.all(
    hydratedUsers.map((user) => userHasPublicProfile(user._id))
  );

  return hydratedUsers.map((user, index) => {
    const hasPublicProfile = publicProfileFlags[index];
    return {
      targetType: TARGET_TYPES.USER,
      userId: String(user._id),
      name: user.name,
      avatarUrl: transformCloudinaryUrl(user.avatar?.url || null),
      hasPublicProfile,
      profileHref: hasPublicProfile ? `/players/${String(user._id)}` : null,
    };
  });
}

// --- league handler ------------------------------------------------------

async function assertLeagueFollowable(leagueId, viewerUserId) {
  assertValidObjectId(leagueId, 'League not found');
  // Reuse the canonical visibility gate: 404 for missing OR
  // private-and-not-a-member (anti-enumeration — no 403/404 side channel).
  await assertLeagueVisible(leagueId, { viewerUserId });
}

// Is this (already-loaded) league currently visible to the viewer? Used at
// hydrate time to degrade the profile link (D8) without failing the whole list.
async function isLeagueCurrentlyVisible(leagueId, viewerUserId) {
  try {
    await assertLeagueVisible(leagueId, { viewerUserId });
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) {
      return false;
    }
    throw error;
  }
}

async function hydrateLeagues(rows, viewerUserId) {
  const leagueIds = rows.map((row) => String(row.targetId));
  const leagues = await listLeaguesByIds(leagueIds);
  const leaguesById = new Map(leagues.map((league) => [String(league._id), league]));

  const present = rows.map((row) => leaguesById.get(String(row.targetId))).filter(Boolean);

  const visibleFlags = await Promise.all(
    present.map((league) => isLeagueCurrentlyVisible(league._id, viewerUserId))
  );

  return present.map((league, index) => {
    const visible = visibleFlags[index];
    return {
      targetType: TARGET_TYPES.LEAGUE,
      leagueId: String(league._id),
      name: league.name,
      logo: transformCloudinaryUrl(league.logo?.url || null),
      // D8: withhold the slug for now-private targets so the client cannot
      // reconstruct a URL — only hand back a link when currently visible.
      slug: visible ? league.slug : null,
      profileHref: visible ? `/league/${league.slug}` : null,
    };
  });
}

// --- leagueTeam handler --------------------------------------------------

async function assertLeagueTeamFollowable(leagueTeamId, viewerUserId) {
  assertValidObjectId(leagueTeamId, 'Team not found');
  const [leagueTeam] = await listLeagueTeamsByIds([leagueTeamId]);
  if (!leagueTeam) {
    throw new ApiError(404, 'Team not found');
  }
  // A leagueTeam has no own isPublic — visibility is delegated entirely to the
  // parent league via the canonical helper (decision DL7 / AL1).
  await assertLeagueVisible(leagueTeam.leagueId, { viewerUserId });
}

async function hydrateLeagueTeams(rows, viewerUserId) {
  const leagueTeamIds = rows.map((row) => String(row.targetId));
  const teams = await listLeagueTeamsByIds(leagueTeamIds);
  const teamsById = new Map(teams.map((team) => [String(team._id), team]));

  const present = rows.map((row) => teamsById.get(String(row.targetId))).filter(Boolean);

  // Batch-fetch the parent leagues once into a Map, mirroring the usersById
  // pattern — no per-team league lookup (no N+1).
  const parentLeagueIds = [...new Set(present.map((team) => String(team.leagueId)))];
  const parentLeagues = await listLeaguesByIds(parentLeagueIds);
  const leaguesById = new Map(parentLeagues.map((league) => [String(league._id), league]));

  const visibleFlags = await Promise.all(
    present.map((team) => isLeagueCurrentlyVisible(team.leagueId, viewerUserId))
  );

  return present.map((team, index) => {
    const parentLeague = leaguesById.get(String(team.leagueId));
    const visible = visibleFlags[index] && Boolean(parentLeague);
    return {
      targetType: TARGET_TYPES.LEAGUE_TEAM,
      leagueTeamId: String(team._id),
      name: team.name,
      logo: transformCloudinaryUrl(team.logo?.url || null),
      teamSlug: visible ? team.slug : null,
      leagueSlug: visible ? parentLeague.slug : null,
      profileHref: visible ? `/league/${parentLeague.slug}/teams/${team.slug}` : null,
    };
  });
}

const TARGET_HANDLERS = {
  [TARGET_TYPES.USER]: {
    assertFollowable: assertUserFollowable,
    hydrateMany: hydrateUsers,
  },
  [TARGET_TYPES.LEAGUE]: {
    assertFollowable: assertLeagueFollowable,
    hydrateMany: hydrateLeagues,
  },
  [TARGET_TYPES.LEAGUE_TEAM]: {
    assertFollowable: assertLeagueTeamFollowable,
    hydrateMany: hydrateLeagueTeams,
  },
};

function resolveHandler(targetType) {
  const handler = TARGET_HANDLERS[targetType];
  if (!handler) {
    throw new ApiError(400, 'Unsupported follow target type');
  }
  return handler;
}

// --- generic operations --------------------------------------------------

async function followTarget(followerUserId, targetType, targetId) {
  const handler = resolveHandler(targetType);
  await handler.assertFollowable(targetId, followerUserId);

  // Idempotent: the repository upserts, so re-following is a no-op success.
  await createFollow({ followerUserId, targetType, targetId });

  return { targetType, targetId: String(targetId), isFollowing: true };
}

async function unfollowTarget(followerUserId, targetType, targetId) {
  resolveHandler(targetType); // validate the type is known (400 otherwise)
  assertValidObjectId(targetId, 'Target not found');

  // No visibility re-check here on purpose: a league going private after you
  // followed it must not trap you into it — you can always unfollow.
  // Idempotent: deleting a non-existent follow is a success.
  await deleteFollow({ followerUserId, targetType, targetId });

  return { targetType, targetId: String(targetId), isFollowing: false };
}

async function listFollowing(followerUserId, options = {}) {
  const targetType = options.targetType || TARGET_TYPES.USER;
  const handler = resolveHandler(targetType);

  const rows = await listFollowingByUser(followerUserId, {
    targetType,
    limit: options.limit,
    cursor: options.cursor,
  });

  const { items, nextCursor } = options.limit
    ? buildCursorPage(rows, options.limit)
    : { items: rows, nextCursor: null };

  const following = await handler.hydrateMany(items, followerUserId);

  return { following, nextCursor };
}

async function getFollowStatuses(followerUserId, targetType, targetIds = []) {
  resolveHandler(targetType); // validate the type is known (400 otherwise)
  const uniqueIds = [...new Set(targetIds.map(String))];
  const followedSet = await findFollowedTargetIds(followerUserId, {
    targetType,
    targetIds: uniqueIds,
  });

  const statuses = {};
  for (const id of uniqueIds) {
    statuses[id] = followedSet.has(id);
  }
  return { statuses };
}

// Back-compat thin wrappers over the generic ops (the controller's legacy
// /users/:userId alias and any direct importers keep working).
function followUser(followerUserId, targetUserId) {
  return followTarget(followerUserId, TARGET_TYPES.USER, targetUserId);
}

function unfollowUser(followerUserId, targetUserId) {
  return unfollowTarget(followerUserId, TARGET_TYPES.USER, targetUserId);
}

module.exports = {
  TARGET_TYPES,
  followTarget,
  unfollowTarget,
  listFollowing,
  getFollowStatuses,
  userHasPublicProfile,
  // back-compat
  followUser,
  unfollowUser,
};
