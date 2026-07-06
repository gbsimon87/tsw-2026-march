const mongoose = require('mongoose');
const { ApiError } = require('../../utils/apiError');
const { findSharedEventIds } = require('../feed/feed.repository');
const { env } = require('../../config/env');
const {
  summarizeEvents,
  summarizeEventsBySide,
  createEmptyPlayerStatLine,
  applyEventToPlayerStatLine,
} = require('../shared/statSummary');
const { TEAM_SIDES } = require('../shared/stats.constants');
const { transformCloudinaryUrl } = require('../shared/cloudinaryUrl');
const {
  listLeaguesByOwner,
  listPublicLeagues: listPublicLeaguesRepo,
  findLeagueById,
  findLeagueByIdAndOwner,
  findLeagueBySlug,
  listLeaguesByIds,
  saveLeague,
  createLeagueTeam,
  listLeagueTeams,
  findLeagueTeamByIdAndLeague,
  findLeagueTeamByLeagueAndSlug,
  saveLeagueTeam,
  createLeaguePlayer,
  findLeaguePlayerById,
  findLeaguePlayerByIdAndTeam,
  listLeaguePlayers,
  listLeaguePlayersByClaimedUser,
  listLeagueTeamsByIds,
  saveLeaguePlayer,
  createLeagueTeamMember,
  findActiveLeagueTeamMember,
  findLeagueTeamMemberById,
  listLeagueTeamMembers,
  listLeagueTeamManagersByLeague,
  listLeagueMembershipsForUser,
  saveLeagueTeamMember,
  createLeagueJoinRequest,
  findLeagueJoinRequestById,
  findPendingLeagueJoinRequest,
  listLeagueJoinRequests,
  saveLeagueJoinRequest,
  createLeagueManager,
  findLeagueManagerById,
  findActiveLeagueManager,
  listLeagueManagersByLeague,
  listLeaguesByManager,
  saveLeagueManager,
  findLeagueStandings,
  upsertLeagueStandings,
  listLeaguePlayerStats,
  replaceLeaguePlayerStats,
} = require('./leagues.repository');
const { findUserByEmail, findUserById } = require('../auth/auth.repository');
const { listLeagueGamesByLeagueId } = require('../games/games.repository');
const { logger } = require('../../config/logger');
const {
  uploadImageBuffer,
  destroyImage,
  isCloudinaryConfigured,
} = require('../feed/cloudinary.client');

const PLAYER_POSITIONS = new Set(['PG', 'SG', 'SF', 'PF', 'C']);
const TEAM_LOGO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeHexColor(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

function normalizePosition(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return PLAYER_POSITIONS.has(normalized) ? normalized : null;
}

function sanitizeLogo(logo) {
  if (!logo?.url) {
    return null;
  }

  return {
    url: transformCloudinaryUrl(logo.url),
    width: logo.width ?? null,
    height: logo.height ?? null,
  };
}

const VALID_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due', 'canceled']);

function normalizeLeagueBilling(league) {
  return {
    plan: league.plan || 'free',
    subscriptionStatus: VALID_SUBSCRIPTION_STATUSES.has(league.subscriptionStatus)
      ? league.subscriptionStatus
      : 'inactive',
    cancelAtPeriodEnd: Boolean(league.cancelAtPeriodEnd),
    currentPeriodEnd: league.currentPeriodEnd ?? null,
  };
}

function sanitizeLeague(league, options = {}) {
  return {
    id: String(league._id),
    ownerUserId: String(league.ownerUserId),
    name: league.name,
    slug: league.slug,
    description: league.description ?? null,
    seasonLabel: league.seasonLabel ?? null,
    status: league.status,
    isPublic: Boolean(league.isPublic),
    logo: sanitizeLogo(league.logo),
    billing: normalizeLeagueBilling(league),
    createdAt: league.createdAt,
    updatedAt: league.updatedAt,
    ...(options.includeTeams ? { teams: options.includeTeams } : {}),
    ...(options.includeStandings ? { standings: options.includeStandings } : {}),
    ...(options.includeGames ? { games: options.includeGames } : {}),
    ...(options.includeViewerContext ? { viewerContext: options.includeViewerContext } : {}),
  };
}

function sanitizeLeaguePlayer(player, usersById = new Map(), options = {}) {
  const claimedUser = player.claimedByUserId ? usersById.get(String(player.claimedByUserId)) : null;

  return {
    id: String(player._id),
    leaguePlayerId: player.leaguePlayerId ? String(player.leaguePlayerId) : String(player._id),
    leagueTeamId: String(player.leagueTeamId),
    displayName: player.displayName,
    jerseyNumber: player.jerseyNumber ?? null,
    position: normalizePosition(player.position),
    isActive: Boolean(player.isActive),
    isClaimed: Boolean(player.claimedByUserId),
    claimedBadgeLabel: player.claimedByUserId ? 'Claimed profile' : null,
    avatarUrl: transformCloudinaryUrl(claimedUser?.avatar?.url || null),
    ...(options.includePrivateClaim
      ? {
          claimedBy: player.claimedByUserId
            ? {
                id: String(player.claimedByUserId),
                name: claimedUser?.name || 'Claimed account',
              }
            : null,
        }
      : {}),
  };
}

function sanitizeLeagueMember(member, usersById = new Map()) {
  const user = usersById.get(String(member.userId));

  return {
    id: String(member._id),
    leagueTeamId: String(member.leagueTeamId),
    userId: String(member.userId),
    role: member.role,
    leaguePlayerId: member.leaguePlayerId ? String(member.leaguePlayerId) : null,
    status: member.status,
    userName: user?.name || null,
    userEmail: user?.email || null,
    createdAt: member.createdAt,
  };
}

function sanitizeLeagueJoinRequest(request, usersById = new Map()) {
  const requester = usersById.get(String(request.requesterUserId));
  const reviewer = request.reviewedByUserId
    ? usersById.get(String(request.reviewedByUserId))
    : null;

  return {
    id: String(request._id),
    requesterUserId: String(request.requesterUserId),
    requesterName: requester?.name || null,
    requestedRole: request.requestedRole,
    requestedLeaguePlayerId: request.requestedLeaguePlayerId
      ? String(request.requestedLeaguePlayerId)
      : null,
    status: request.status,
    reviewedByUserId: request.reviewedByUserId ? String(request.reviewedByUserId) : null,
    reviewedByName: reviewer?.name || null,
    reviewedAt: request.reviewedAt ?? null,
    createdAt: request.createdAt,
  };
}

function sanitizeLeagueTeam(team, options = {}) {
  return {
    id: String(team._id),
    leagueId: String(team.leagueId),
    name: team.name,
    slug: team.slug,
    logo: sanitizeLogo(team.logo),
    colors: Array.isArray(team.colors) ? team.colors.map(normalizeHexColor).filter(Boolean) : [],
    status: team.status,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
    ...(options.includeRosterCounts
      ? {
          rosterCount: options.includeRosterCounts.rosterCount,
          activeRosterCount: options.includeRosterCounts.activeRosterCount,
        }
      : {}),
    ...(options.includeRoster ? { roster: options.includeRoster } : {}),
    ...(options.includeMembers ? { members: options.includeMembers } : {}),
    ...(options.includeJoinRequests ? { joinRequests: options.includeJoinRequests } : {}),
    ...(options.includeStats ? { stats: options.includeStats } : {}),
    ...(options.includeGames ? { games: options.includeGames } : {}),
    ...(options.includeStandingsPosition
      ? { standingsPosition: options.includeStandingsPosition }
      : {}),
  };
}

function sanitizeLeagueManager(manager, usersById = new Map()) {
  const user = usersById.get(String(manager.userId));

  return {
    id: String(manager._id),
    leagueId: String(manager.leagueId),
    userId: String(manager.userId),
    status: manager.status,
    userName: user?.name || null,
    userEmail: user?.email || null,
    createdAt: manager.createdAt,
  };
}

async function assertLeagueExists(leagueId) {
  const league = await findLeagueById(leagueId);
  if (!league) {
    throw new ApiError(404, 'League not found');
  }
  return league;
}

async function assertLeagueViewer(userId, leagueId) {
  const league = await assertLeagueExists(leagueId);
  const isOwner = String(league.ownerUserId) === String(userId);

  if (isOwner) {
    return league;
  }

  const [leagueMgr, memberships] = await Promise.all([
    findActiveLeagueManager(leagueId, userId),
    listLeagueMembershipsForUser(userId),
  ]);

  if (leagueMgr) {
    return league;
  }

  const hasMembership = memberships.some(
    (membership) => String(membership.leagueId) === String(league._id)
  );

  if (!hasMembership) {
    throw new ApiError(403, 'Forbidden');
  }

  return league;
}

async function assertLeagueOwner(userId, leagueId) {
  const league = await findLeagueByIdAndOwner(leagueId, userId);
  if (!league) {
    throw new ApiError(404, 'League not found');
  }
  return league;
}

async function assertLeagueManagerOrOwner(userId, leagueId) {
  const league = await assertLeagueExists(leagueId);
  if (String(league.ownerUserId) === String(userId)) {
    return { league, role: 'owner' };
  }

  const record = await findActiveLeagueManager(leagueId, userId);
  if (!record) {
    throw new ApiError(403, 'Forbidden');
  }

  return { league, role: 'league_manager' };
}

function ensureLeagueEditable(league) {
  if (league.status === 'archived') {
    throw new ApiError(400, 'League is archived');
  }
}

async function isTeamManager(userId, leagueTeamId) {
  const member = await findActiveLeagueTeamMember(leagueTeamId, userId);
  return Boolean(member && member.role === 'manager');
}

async function assertTeamManagerOrOwner(userId, leagueId, leagueTeamId) {
  const league = await assertLeagueExists(leagueId);
  if (String(league.ownerUserId) === String(userId)) {
    return { league, role: 'owner' };
  }

  const leagueMgr = await findActiveLeagueManager(leagueId, userId);
  if (leagueMgr) {
    return { league, role: 'league_manager' };
  }

  const member = await findActiveLeagueTeamMember(leagueTeamId, userId);
  if (!member || member.role !== 'manager') {
    throw new ApiError(403, 'Forbidden');
  }

  return { league, role: 'manager' };
}

async function getLeagueTeamAccess(userId, leagueId, leagueTeamId) {
  const league = await assertLeagueExists(leagueId);
  if (String(league.ownerUserId) === String(userId)) {
    return { league, role: 'owner', member: null };
  }

  const leagueMgr = await findActiveLeagueManager(leagueId, userId);
  if (leagueMgr) {
    return { league, role: 'league_manager', member: null };
  }

  const member = await findActiveLeagueTeamMember(leagueTeamId, userId);
  if (!member) {
    throw new ApiError(403, 'Forbidden');
  }

  return { league, role: member.role, member };
}

async function assertLeagueParticipant(userId, leagueId) {
  const league = await assertLeagueExists(leagueId);
  if (String(league.ownerUserId) === String(userId)) {
    return { league, role: 'owner' };
  }
  const leagueMgr = await findActiveLeagueManager(leagueId, userId);
  if (leagueMgr) {
    return { league, role: 'league_manager' };
  }
  const memberships = await listLeagueMembershipsForUser(userId);
  const teamMembership = memberships.find((m) => String(m.leagueId) === String(leagueId));
  if (teamMembership) {
    return { league, role: 'team_manager' };
  }
  throw new ApiError(403, 'Forbidden');
}

async function assertLeagueVisible(leagueIdOrSlug, options = {}) {
  const league = options.bySlug
    ? await findLeagueBySlug(leagueIdOrSlug)
    : await findLeagueById(leagueIdOrSlug);
  if (!league || !league.isPublic || league.status !== 'active') {
    throw new ApiError(404, 'League not found');
  }

  return league;
}

async function assertLeagueTeamExists(leagueId, leagueTeamId) {
  const leagueTeam = await findLeagueTeamByIdAndLeague(leagueTeamId, leagueId);
  if (!leagueTeam) {
    throw new ApiError(404, 'League team not found');
  }
  return leagueTeam;
}

async function buildUsersMap(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const entries = await Promise.all(ids.map((id) => findUserById(id)));
  return new Map(entries.filter(Boolean).map((user) => [String(user._id), user]));
}

async function createLeagueForUser(userId, payload) {
  // League documents are created by the Stripe webhook after checkout.
  // This function configures the stub league (name, slug, settings) that the
  // webhook created. It finds the most recent unconfigured league for this owner.
  const { isLeagueActive } = require('../billing/billing.service');
  const { League } = require('./leagues.repository');

  const stub = await League.findOne({
    ownerUserId: userId,
    name: 'My League',
  }).sort({ createdAt: -1 });

  if (!stub) {
    throw new ApiError(
      402,
      'No pending league found. Complete checkout before configuring your league.'
    );
  }

  if (!isLeagueActive(stub)) {
    throw new ApiError(402, 'League subscription is not active. Complete checkout first.');
  }

  const slug = payload.slug?.trim() ? slugify(payload.slug) : slugify(payload.name);
  if (!slug) {
    throw new ApiError(400, 'League slug is required');
  }

  const existing = await findLeagueBySlug(slug);
  if (existing && String(existing._id) !== String(stub._id)) {
    throw new ApiError(409, 'League slug is already in use');
  }

  stub.name = payload.name.trim();
  stub.slug = slug;
  stub.description = payload.description?.trim() || stub.description || undefined;
  stub.seasonLabel = payload.seasonLabel?.trim() || stub.seasonLabel || undefined;
  stub.status = 'active';
  stub.isPublic = payload.isPublic !== false;

  await saveLeague(stub);
  return sanitizeLeague(stub);
}

async function listLeaguesForUser(userId) {
  const [ownedLeagues, memberships, managerships] = await Promise.all([
    listLeaguesByOwner(userId),
    listLeagueMembershipsForUser(userId),
    listLeaguesByManager(userId),
  ]);
  const memberLeagueIds = memberships.map((membership) => membership.leagueId).filter(Boolean);
  const managedLeagueIds = managerships.map((mgr) => mgr.leagueId).filter(Boolean);
  const allMemberLeagueIds = [...memberLeagueIds, ...managedLeagueIds];
  const memberLeagues =
    allMemberLeagueIds.length > 0 ? await listLeaguesByIds(allMemberLeagueIds) : [];
  const combined = new Map();

  for (const league of [...ownedLeagues, ...memberLeagues]) {
    combined.set(String(league._id), league);
  }

  const sortedLeagues = Array.from(combined.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const viewerContexts = await Promise.all(
    sortedLeagues.map((league) => buildLeagueViewerContext(userId, league))
  );

  return sortedLeagues.map((league, index) =>
    sanitizeLeague(league, { includeViewerContext: viewerContexts[index] })
  );
}

async function listPublicLeagues() {
  const leagues = await listPublicLeaguesRepo();
  const teamsPerLeague = await Promise.all(leagues.map((league) => listLeagueTeams(league._id)));
  return leagues.map((league, i) =>
    sanitizeLeague(league, {
      includeTeams: teamsPerLeague[i]
        .filter((team) => team.status === 'active')
        .map((team) => sanitizeLeagueTeam(team)),
    })
  );
}

async function buildLeagueViewerContext(userId, league) {
  if (String(league.ownerUserId) === String(userId)) {
    return { viewerRole: 'owner', managedTeamIds: [] };
  }

  const [leagueMgr, memberships] = await Promise.all([
    findActiveLeagueManager(league._id, userId),
    listLeagueMembershipsForUser(userId),
  ]);

  if (leagueMgr) {
    return { viewerRole: 'league_manager', managedTeamIds: [] };
  }

  const leagueMemberships = memberships.filter((m) => String(m.leagueId) === String(league._id));
  const managerMemberships = leagueMemberships.filter((m) => m.role === 'manager');

  if (managerMemberships.length > 0) {
    return {
      viewerRole: 'team_manager',
      managedTeamIds: managerMemberships.map((m) => String(m.leagueTeamId)),
    };
  }

  const topRole = leagueMemberships.find((m) => m.role === 'helper') ? 'helper' : 'player';
  return { viewerRole: topRole, managedTeamIds: [] };
}

async function getLeagueForUser(userId, leagueId) {
  const league = await assertLeagueViewer(userId, leagueId);

  // OPT-005: fetch teams + raw games ONCE, then pass down to the standings and
  // games-row builders instead of letting each re-query (was teams×3, games×2).
  const [teams, rawGames, viewerContext] = await Promise.all([
    listLeagueTeams(league._id),
    listLeagueGamesByLeagueId(league._id),
    buildLeagueViewerContext(userId, league),
  ]);
  const [standings, games] = await Promise.all([
    getLeagueStandings(league._id, { teams, games: rawGames }),
    listLeagueGames(league._id, { teams, games: rawGames }),
  ]);
  const canViewAllTeamManagers =
    viewerContext.viewerRole === 'owner' || viewerContext.viewerRole === 'league_manager';
  const teamManagers = canViewAllTeamManagers
    ? await listLeagueTeamManagersByLeague(league._id)
    : viewerContext.viewerRole === 'team_manager' && viewerContext.managedTeamIds?.length
      ? await Promise.all(
          viewerContext.managedTeamIds.map((teamId) => listLeagueTeamMembers(teamId))
        ).then((results) => results.flat().filter((m) => m.role === 'manager'))
      : [];
  const usersById = await buildUsersMap(teamManagers.map((member) => member.userId));
  const managersByTeamId = new Map();

  teamManagers.forEach((member) => {
    const teamId = String(member.leagueTeamId);
    const current = managersByTeamId.get(teamId) || [];
    current.push(sanitizeLeagueMember(member, usersById));
    managersByTeamId.set(teamId, current);
  });

  return sanitizeLeague(league, {
    includeTeams: teams.map((team) =>
      sanitizeLeagueTeam(team, {
        includeMembers: managersByTeamId.get(String(team._id)) || [],
      })
    ),
    includeStandings: standings,
    includeGames: games,
    includeViewerContext: viewerContext,
  });
}

async function getPublicLeagueBySlug(slug) {
  const league = await assertLeagueVisible(slug, { bySlug: true });
  // OPT-005: fetch teams + raw games ONCE, then pass down (was teams×3, games×2).
  // NOTE: publicOnly is preserved as-is; listLeagueGames currently ignores it
  // (tracked separately in OPT-024). This refactor does not change that behaviour.
  const [teams, rawGames] = await Promise.all([
    listLeagueTeams(league._id),
    listLeagueGamesByLeagueId(league._id),
  ]);
  const [standings, games] = await Promise.all([
    getLeagueStandings(league._id, { teams, games: rawGames }),
    listLeagueGames(league._id, { publicOnly: true, teams, games: rawGames }),
  ]);

  return sanitizeLeague(league, {
    includeTeams: teams.map((team) => sanitizeLeagueTeam(team)),
    includeStandings: standings,
    includeGames: games,
  });
}

async function updateLeagueForUser(userId, leagueId, payload) {
  const { league } = await assertLeagueManagerOrOwner(userId, leagueId);
  ensureLeagueEditable(league);

  if (payload.name) {
    league.name = payload.name.trim();
  }

  if (payload.slug) {
    const nextSlug = slugify(payload.slug);
    const existing = await findLeagueBySlug(nextSlug);
    if (existing && String(existing._id) !== String(league._id)) {
      throw new ApiError(409, 'League slug is already in use');
    }
    league.slug = nextSlug;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
    league.description = payload.description?.trim() || null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'seasonLabel')) {
    league.seasonLabel = payload.seasonLabel?.trim() || null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'isPublic')) {
    league.isPublic = Boolean(payload.isPublic);
  }

  await saveLeague(league);
  return sanitizeLeague(league);
}

async function archiveLeagueForUser(userId, leagueId) {
  const league = await assertLeagueOwner(userId, leagueId);
  league.status = 'archived';
  await saveLeague(league);
  return sanitizeLeague(league);
}

async function createLeagueTeamForLeague(userId, leagueId, payload) {
  const { isLeagueActive } = require('../billing/billing.service');
  const { league } = await assertLeagueManagerOrOwner(userId, leagueId);
  if (!isLeagueActive(league)) {
    throw new ApiError(402, 'An active League subscription is required to add teams');
  }
  ensureLeagueEditable(league);

  const slug = payload.slug?.trim() ? slugify(payload.slug) : slugify(payload.name);
  if (!slug) {
    throw new ApiError(400, 'League team slug is required');
  }

  const existingTeams = await listLeagueTeams(league._id);
  if (existingTeams.some((team) => normalizeName(team.name) === normalizeName(payload.name))) {
    throw new ApiError(409, 'League team name is already in use');
  }
  if (existingTeams.some((team) => team.slug === slug)) {
    throw new ApiError(409, 'League team slug is already in use');
  }

  const leagueTeam = await createLeagueTeam({
    leagueId,
    name: payload.name.trim(),
    slug,
    colors: (payload.colors || []).map(normalizeHexColor).filter(Boolean),
    status: 'active',
  });

  // OPT-010: a new team adds a (zeroed) standings row.
  scheduleLeagueAggregateRecompute(leagueId);
  return sanitizeLeagueTeam(leagueTeam);
}

async function listTeamsForLeagueViewer(userId, leagueId) {
  await assertLeagueViewer(userId, leagueId);
  const teams = await listLeagueTeams(leagueId);
  const rows = await Promise.all(
    teams.map(async (team) => {
      const players = await listLeaguePlayers(team._id);
      return {
        team,
        rosterCount: players.length,
        activeRosterCount: players.filter((player) => player.isActive).length,
      };
    })
  );

  return rows.map(({ team, rosterCount, activeRosterCount }) =>
    sanitizeLeagueTeam(team, {
      includeRosterCounts: {
        rosterCount,
        activeRosterCount,
      },
    })
  );
}

async function getLeagueTeamForUser(userId, leagueId, leagueTeamId) {
  const access = await getLeagueTeamAccess(userId, leagueId, leagueTeamId);
  const team = await assertLeagueTeamExists(leagueId, leagueTeamId);
  // OPT-005: load league teams + raw games once, reuse for both standings and
  // the games rows (was teams×3, games×2 for this endpoint).
  const canManage =
    access.role === 'owner' || access.role === 'league_manager' || access.role === 'manager';
  const [players, members, joinRequests, leagueTeams, rawGames] = await Promise.all([
    listLeaguePlayers(team._id),
    canManage ? listLeagueTeamMembers(team._id) : Promise.resolve([]),
    canManage ? listLeagueJoinRequests(team._id) : Promise.resolve([]),
    listLeagueTeams(leagueId),
    listLeagueGamesByLeagueId(leagueId),
  ]);
  const [standings, games] = await Promise.all([
    getLeagueStandings(leagueId, { teams: leagueTeams, games: rawGames }),
    listLeagueGames(leagueId, { teams: leagueTeams, games: rawGames }),
  ]);
  const usersById = await buildUsersMap([
    ...players.map((player) => player.claimedByUserId),
    ...members.map((member) => member.userId),
    ...joinRequests.map((request) => request.requesterUserId),
    ...joinRequests.map((request) => request.reviewedByUserId),
  ]);
  const standingsPosition =
    standings.findIndex((row) => row.teamId === String(team._id)) >= 0
      ? standings.findIndex((row) => row.teamId === String(team._id)) + 1
      : null;

  return sanitizeLeagueTeam(team, {
    includeRoster: players.map((player) =>
      sanitizeLeaguePlayer(player, usersById, { includePrivateClaim: true })
    ),
    includeMembers: members.map((member) => sanitizeLeagueMember(member, usersById)),
    includeJoinRequests: joinRequests.map((request) =>
      sanitizeLeagueJoinRequest(request, usersById)
    ),
    includeGames: games.filter(
      (game) =>
        String(game.homeLeagueTeamId) === String(team._id) ||
        String(game.awayLeagueTeamId) === String(team._id)
    ),
    includeStandingsPosition: standingsPosition,
    includeStats: {
      canManage:
        access.role === 'owner' || access.role === 'league_manager' || access.role === 'manager',
      canReviewRequests:
        access.role === 'owner' || access.role === 'league_manager' || access.role === 'manager',
      viewerRole: access.role,
    },
  });
}

async function getPublicLeagueTeamBySlug(leagueSlug, teamSlug) {
  const league = await assertLeagueVisible(leagueSlug, { bySlug: true });
  const team = await findLeagueTeamByLeagueAndSlug(league._id, teamSlug);
  if (!team) {
    throw new ApiError(404, 'League team not found');
  }

  // OPT-005: load league teams + raw games once; derive game rows, raw games,
  // and standings from the same data (was teams×2, games×3).
  const [players, leagueTeams, rawGames] = await Promise.all([
    listLeaguePlayers(team._id),
    listLeagueTeams(league._id),
    listLeagueGamesByLeagueId(league._id),
  ]);
  const [games, standings] = await Promise.all([
    listLeagueGames(league._id, { teams: leagueTeams, games: rawGames }),
    getLeagueStandings(league._id, { teams: leagueTeams, games: rawGames }),
  ]);
  const usersById = await buildUsersMap(players.map((p) => p.claimedByUserId));
  const teamGames = games.filter(
    (game) =>
      String(game.homeLeagueTeamId) === String(team._id) ||
      String(game.awayLeagueTeamId) === String(team._id)
  );
  const rawTeamGames = rawGames.filter(
    (game) =>
      String(game.homeLeagueTeamId) === String(team._id) ||
      String(game.awayLeagueTeamId) === String(team._id)
  );
  const playerStats = buildLeagueTeamPlayerStats(rawTeamGames, team._id, players);
  const avatarByPlayerId = new Map(
    players
      .filter((p) => p.claimedByUserId)
      .map((p) => {
        const user = usersById.get(String(p.claimedByUserId));
        return [String(p._id), transformCloudinaryUrl(user?.avatar?.url || null)];
      })
  );
  const playerStatsWithAvatars = playerStats.map((row) => ({
    ...row,
    avatarUrl: avatarByPlayerId.get(String(row.playerId)) || null,
  }));
  const standingsRow = standings.find((row) => row.teamId === String(team._id)) || null;

  return {
    league: sanitizeLeague(league),
    team: sanitizeLeagueTeam(team, {
      includeRoster: players.map((player) => sanitizeLeaguePlayer(player, usersById)),
      includeGames: teamGames,
      includeStats: playerStatsWithAvatars,
      includeStandingsPosition: standingsRow
        ? standings.findIndex((row) => row.teamId === String(team._id)) + 1
        : null,
    }),
  };
}

const HIGHLIGHT_STAT_TYPES = new Set([
  'FG2_MADE',
  'FG2_MISS',
  'FG3_MADE',
  'FG3_MISS',
  'FT_MADE',
  'FT_MISS',
  'AST',
  'STL',
  'BLK',
]);

function buildLeaguePlayerHighlights(games, leagueTeamId, leaguePlayerId) {
  const highlights = [];
  for (const game of games) {
    if (!game.videoUrl) continue;
    const { rosterSnapshot, eventFilter } = getLeagueGameSnapshotForTeam(game, leagueTeamId);
    const snapshotPlayer = rosterSnapshot.find(
      (p) => String(p.leaguePlayerId || p._id) === String(leaguePlayerId)
    );
    if (!snapshotPlayer) continue;
    const snapshotPlayerIdStr = String(snapshotPlayer._id);
    for (const ev of game.events || []) {
      if (
        ev.playerId &&
        String(ev.playerId) === snapshotPlayerIdStr &&
        eventFilter(ev) &&
        HIGHLIGHT_STAT_TYPES.has(ev.statType) &&
        typeof ev.videoTimestamp === 'number'
      ) {
        highlights.push({
          eventId: String(ev._id),
          gameId: String(game._id),
          statType: ev.statType,
          videoTimestamp: ev.videoTimestamp,
          videoUrl: game.videoUrl,
          gameTitle: game.title || null,
        });
      }
    }
  }
  return highlights;
}

function buildLeaguePlayerGameRows(games, leagueTeamId, leaguePlayerId, teamsById = new Map()) {
  const gameRows = [];

  for (const game of games) {
    const { rosterSnapshot, eventFilter } = getLeagueGameSnapshotForTeam(game, leagueTeamId);
    const snapshotPlayer = rosterSnapshot.find(
      (player) => String(player.leaguePlayerId || player._id) === String(leaguePlayerId)
    );
    if (!snapshotPlayer) {
      continue;
    }

    const stats = emptyStats(String(leaguePlayerId), snapshotPlayer.displayName);
    for (const event of game.events || []) {
      if (String(event.playerId) !== String(snapshotPlayer._id) || !eventFilter(event)) {
        continue;
      }
      applyEventToLine(stats, event.statType);
    }

    gameRows.push({
      gameId: String(game.id || game._id),
      title: game.title,
      scheduledAt: game.scheduledAt ?? null,
      completedAt: game.completedAt ?? null,
      createdAt: game.createdAt ?? null,
      opponent:
        String(game.homeLeagueTeamId) === String(leagueTeamId)
          ? game.awayTeamName
          : game.homeTeamName,
      opponentLogoUrl: (() => {
        const opponentTeamId =
          String(game.homeLeagueTeamId) === String(leagueTeamId)
            ? String(game.awayLeagueTeamId)
            : String(game.homeLeagueTeamId);
        return transformCloudinaryUrl(teamsById.get(opponentTeamId)?.logo?.url || null);
      })(),
      opponentDestination: {
        kind: 'game',
        href: `/games/${game.id || game._id}`,
      },
      stats,
    });
  }

  return gameRows.sort((a, b) => {
    const aTime = new Date(a.completedAt || a.scheduledAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.completedAt || b.scheduledAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function buildLeaguePlayerSummary(gameRows) {
  const totals = gameRows.reduce(
    (summary, game) => ({
      ftm: summary.ftm + game.stats.ftm,
      fta: summary.fta + game.stats.fta,
      fg2m: summary.fg2m + game.stats.fg2m,
      fg2a: summary.fg2a + game.stats.fg2a,
      fg3m: summary.fg3m + game.stats.fg3m,
      fg3a: summary.fg3a + game.stats.fg3a,
      ast: summary.ast + game.stats.ast,
      oreb: summary.oreb + game.stats.oreb,
      dreb: summary.dreb + game.stats.dreb,
      stl: summary.stl + game.stats.stl,
      blk: summary.blk + (game.stats.blk || 0),
      tov: summary.tov + game.stats.tov,
      foul: summary.foul + game.stats.foul,
      reb: summary.reb + game.stats.reb,
      points: summary.points + game.stats.points,
    }),
    emptyStats(null, null)
  );
  const gamesCount = gameRows.length;

  return {
    gamesCount,
    points: totals.points,
    reb: totals.reb,
    ast: totals.ast,
    stl: totals.stl,
    blk: totals.blk,
    tov: totals.tov,
    foul: totals.foul,
    pointsPerGame: gamesCount > 0 ? totals.points / gamesCount : 0,
    reboundsPerGame: gamesCount > 0 ? totals.reb / gamesCount : 0,
    assistsPerGame: gamesCount > 0 ? totals.ast / gamesCount : 0,
    stealsPerGame: gamesCount > 0 ? totals.stl / gamesCount : 0,
    blocksPerGame: gamesCount > 0 ? totals.blk / gamesCount : 0,
    turnoversPerGame: gamesCount > 0 ? totals.tov / gamesCount : 0,
    foulsPerGame: gamesCount > 0 ? totals.foul / gamesCount : 0,
  };
}

async function getMyLeagueProfiles(userId) {
  const players = await listLeaguePlayersByClaimedUser(userId);
  if (players.length === 0) {
    return { profiles: [] };
  }

  const leagueIds = [...new Set(players.map((p) => String(p.leagueId)))];
  const teamIds = [...new Set(players.map((p) => String(p.leagueTeamId)))];

  const [leagues, teams, memberships] = await Promise.all([
    listLeaguesByIds(leagueIds),
    listLeagueTeamsByIds(teamIds),
    listLeagueMembershipsForUser(userId),
  ]);

  const leaguesById = new Map(leagues.map((l) => [String(l._id), l]));
  const teamsById = new Map(teams.map((t) => [String(t._id), t]));
  const memberRoleByTeamId = new Map(memberships.map((m) => [String(m.leagueTeamId), m.role]));

  const MEMBER_ROLE_LABELS = {
    player: 'Player',
    manager: 'Team Manager',
    helper: 'Helper',
  };

  const profiles = players.map((player) => {
    const team = teamsById.get(String(player.leagueTeamId));
    const league = leaguesById.get(String(player.leagueId));
    const playerLabel =
      typeof player.jerseyNumber === 'number'
        ? `#${player.jerseyNumber} ${player.displayName}`
        : player.displayName;
    const memberRole = memberRoleByTeamId.get(String(player.leagueTeamId)) ?? null;

    return {
      id: String(player._id),
      displayName: player.displayName,
      playerLabel,
      jerseyNumber: player.jerseyNumber ?? null,
      position: normalizePosition(player.position),
      memberRole,
      memberRoleLabel: memberRole ? (MEMBER_ROLE_LABELS[memberRole] ?? memberRole) : null,
      team: team ? sanitizeLeagueTeam(team) : null,
      league: league ? sanitizeLeague(league) : null,
      profileHref:
        team && league
          ? `/league/${league.slug}/teams/${team.slug}/players/${String(player._id)}`
          : null,
    };
  });

  return { profiles };
}

async function getPublicLeaguePlayerBySlug(
  leagueSlug,
  teamSlug,
  leaguePlayerId,
  viewerUserId = null
) {
  const league = await assertLeagueVisible(leagueSlug, { bySlug: true });
  const team = await findLeagueTeamByLeagueAndSlug(league._id, teamSlug);
  if (!team) {
    throw new ApiError(404, 'League team not found');
  }

  const player = await findLeaguePlayerByIdAndTeam(leaguePlayerId, team._id);
  if (!player) {
    throw new ApiError(404, 'League player not found');
  }

  const [games, allTeams, usersById] = await Promise.all([
    listLeagueGamesByLeagueId(league._id),
    listLeagueTeams(league._id),
    buildUsersMap([player.claimedByUserId]),
  ]);
  const teamsById = new Map(allTeams.map((t) => [String(t._id), t]));
  const gameRows = buildLeaguePlayerGameRows(games, team._id, player._id, teamsById);
  const highlights = buildLeaguePlayerHighlights(games, team._id, player._id);

  const highlightEventIds = highlights.map((h) => h.eventId).filter(Boolean);
  const sharedEventIds = await findSharedEventIds(highlightEventIds);

  const sanitizedPlayer = sanitizeLeaguePlayer(player, usersById);
  sanitizedPlayer.isMe = Boolean(
    viewerUserId &&
    player.claimedByUserId &&
    String(player.claimedByUserId) === String(viewerUserId)
  );

  return {
    league: sanitizeLeague(league),
    team: sanitizeLeagueTeam(team),
    player: sanitizedPlayer,
    summary: buildLeaguePlayerSummary(gameRows),
    games: gameRows,
    highlights,
    sharedEventIds,
  };
}

async function updateLeagueTeamForLeague(userId, leagueId, leagueTeamId, payload) {
  const { league } = await assertTeamManagerOrOwner(userId, leagueId, leagueTeamId);
  ensureLeagueEditable(league);
  const team = await assertLeagueTeamExists(leagueId, leagueTeamId);

  if (payload.name) {
    team.name = payload.name.trim();
  }
  if (payload.slug) {
    const nextSlug = slugify(payload.slug);
    const existing = await findLeagueTeamByLeagueAndSlug(leagueId, nextSlug);
    if (existing && String(existing._id) !== String(team._id)) {
      throw new ApiError(409, 'League team slug is already in use');
    }
    team.slug = nextSlug;
  }
  if (payload.colors) {
    team.colors = payload.colors.map(normalizeHexColor).filter(Boolean);
  }

  await saveLeagueTeam(team);
  // OPT-010: team rename changes the teamName in standings rows.
  scheduleLeagueAggregateRecompute(leagueId);
  return sanitizeLeagueTeam(team);
}

async function archiveLeagueTeamForLeague(userId, leagueId, leagueTeamId) {
  const { league, role } = await assertTeamManagerOrOwner(userId, leagueId, leagueTeamId);
  if (role === 'manager') {
    throw new ApiError(403, 'Only league owners and league managers can archive teams');
  }
  ensureLeagueEditable(league);
  const team = await assertLeagueTeamExists(leagueId, leagueTeamId);
  team.status = 'archived';
  await saveLeagueTeam(team);
  // OPT-010: archiving changes the standings row set.
  scheduleLeagueAggregateRecompute(leagueId);
  return sanitizeLeagueTeam(team);
}

async function uploadLeagueTeamLogo(userId, leagueId, leagueTeamId, file) {
  const { league } = await assertTeamManagerOrOwner(userId, leagueId, leagueTeamId);
  ensureLeagueEditable(league);
  const team = await assertLeagueTeamExists(leagueId, leagueTeamId);

  if (!isCloudinaryConfigured()) {
    throw new ApiError(503, 'Image upload is not configured');
  }
  if (!file) {
    throw new ApiError(400, 'Logo file is required');
  }
  if (!TEAM_LOGO_MIME_TYPES.has(file.mimetype)) {
    throw new ApiError(400, 'Logo must be a JPEG, PNG, or WebP image');
  }
  if (file.size > env.TEAM_LOGO_MAX_BYTES) {
    throw new ApiError(400, 'Logo exceeds upload size limit');
  }

  const previousLogo = team.logo;
  const upload = await uploadImageBuffer(file);
  team.logo = {
    url: upload.secure_url,
    publicId: upload.public_id,
    width: upload.width ?? null,
    height: upload.height ?? null,
    mimeType: file.mimetype,
  };
  await saveLeagueTeam(team);

  if (previousLogo?.publicId && previousLogo.publicId !== upload.public_id) {
    await destroyImage(previousLogo.publicId).catch(() => null);
  }

  return sanitizeLeagueTeam(team);
}

async function removeLeagueTeamLogo(userId, leagueId, leagueTeamId) {
  const { league } = await assertTeamManagerOrOwner(userId, leagueId, leagueTeamId);
  ensureLeagueEditable(league);
  const team = await assertLeagueTeamExists(leagueId, leagueTeamId);
  const previousLogo = team.logo;
  team.logo = null;
  await saveLeagueTeam(team);

  if (previousLogo?.publicId) {
    await destroyImage(previousLogo.publicId).catch(() => null);
  }

  return sanitizeLeagueTeam(team);
}

async function uploadLeagueLogo(userId, leagueId, file) {
  const { league } = await assertLeagueManagerOrOwner(userId, leagueId);

  if (!isCloudinaryConfigured()) {
    throw new ApiError(503, 'Image upload is not configured');
  }
  if (!file) {
    throw new ApiError(400, 'Logo file is required');
  }
  if (!TEAM_LOGO_MIME_TYPES.has(file.mimetype)) {
    throw new ApiError(400, 'Logo must be a JPEG, PNG, or WebP image');
  }
  if (file.size > env.TEAM_LOGO_MAX_BYTES) {
    throw new ApiError(400, 'Logo exceeds upload size limit');
  }

  const previousLogo = league.logo;
  const upload = await uploadImageBuffer(file);
  league.logo = {
    url: upload.secure_url,
    publicId: upload.public_id,
    width: upload.width ?? null,
    height: upload.height ?? null,
    mimeType: file.mimetype,
  };
  await saveLeague(league);

  if (previousLogo?.publicId && previousLogo.publicId !== upload.public_id) {
    await destroyImage(previousLogo.publicId).catch(() => null);
  }

  return sanitizeLeague(league);
}

async function removeLeagueLogo(userId, leagueId) {
  const { league } = await assertLeagueManagerOrOwner(userId, leagueId);
  const previousLogo = league.logo;
  league.logo = null;
  await saveLeague(league);

  if (previousLogo?.publicId) {
    await destroyImage(previousLogo.publicId).catch(() => null);
  }

  return sanitizeLeague(league);
}

async function addPlayerToLeagueTeam(userId, leagueId, leagueTeamId, payload) {
  const { league } = await assertTeamManagerOrOwner(userId, leagueId, leagueTeamId);
  ensureLeagueEditable(league);
  const team = await assertLeagueTeamExists(leagueId, leagueTeamId);
  const existingPlayers = await listLeaguePlayers(team._id);

  if (
    existingPlayers.some(
      (player) =>
        player.isActive && normalizeName(player.displayName) === normalizeName(payload.displayName)
    )
  ) {
    throw new ApiError(409, 'Player name is already in use on this team');
  }

  const player = await createLeaguePlayer({
    leagueId,
    leagueTeamId,
    displayName: payload.displayName.trim(),
    jerseyNumber: payload.jerseyNumber ?? null,
    position: normalizePosition(payload.position),
    isActive: true,
  });

  return sanitizeLeaguePlayer(player);
}

async function updateLeaguePlayer(userId, leagueId, leagueTeamId, leaguePlayerId, payload) {
  const { league } = await assertTeamManagerOrOwner(userId, leagueId, leagueTeamId);
  ensureLeagueEditable(league);
  const player = await findLeaguePlayerByIdAndTeam(leaguePlayerId, leagueTeamId);
  if (!player) {
    throw new ApiError(404, 'League player not found');
  }

  if (payload.displayName) {
    const players = await listLeaguePlayers(leagueTeamId);
    if (
      players.some(
        (candidate) =>
          String(candidate._id) !== String(player._id) &&
          candidate.isActive &&
          normalizeName(candidate.displayName) === normalizeName(payload.displayName)
      )
    ) {
      throw new ApiError(409, 'Player name is already in use on this team');
    }
    player.displayName = payload.displayName.trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'jerseyNumber')) {
    player.jerseyNumber = payload.jerseyNumber ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'position')) {
    player.position = normalizePosition(payload.position);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'isActive')) {
    player.isActive = Boolean(payload.isActive);
  }

  await saveLeaguePlayer(player);
  return sanitizeLeaguePlayer(player);
}

async function removeLeaguePlayer(userId, leagueId, leagueTeamId, leaguePlayerId) {
  const { league } = await assertTeamManagerOrOwner(userId, leagueId, leagueTeamId);
  ensureLeagueEditable(league);
  const player = await findLeaguePlayerByIdAndTeam(leaguePlayerId, leagueTeamId);
  if (!player) {
    throw new ApiError(404, 'League player not found');
  }

  player.isActive = false;
  await saveLeaguePlayer(player);
  return sanitizeLeaguePlayer(player);
}

async function listLeagueMembersForTeam(userId, leagueId, leagueTeamId) {
  await assertTeamManagerOrOwner(userId, leagueId, leagueTeamId);
  const members = await listLeagueTeamMembers(leagueTeamId);
  const usersById = await buildUsersMap(members.map((member) => member.userId));
  return members.map((member) => sanitizeLeagueMember(member, usersById));
}

async function addManagerByEmail(userId, leagueId, leagueTeamId, email) {
  const { league } = await assertLeagueManagerOrOwner(userId, leagueId);
  ensureLeagueEditable(league);
  const leagueTeam = await assertLeagueTeamExists(leagueId, leagueTeamId);
  const targetUser = await findUserByEmail(email);
  if (!targetUser) {
    throw new ApiError(404, 'User not found');
  }

  let member = await findActiveLeagueTeamMember(leagueTeam._id, targetUser._id);
  if (member) {
    member.role = 'manager';
    member.leaguePlayerId = null;
    await saveLeagueTeamMember(member);
  } else {
    member = await createLeagueTeamMember({
      leagueId,
      leagueTeamId,
      userId: targetUser._id,
      role: 'manager',
      leaguePlayerId: null,
      createdByUserId: userId,
    });
  }

  return sanitizeLeagueMember(member, new Map([[String(targetUser._id), targetUser]]));
}

async function updateLeagueMember(userId, leagueId, leagueTeamId, memberId, payload) {
  const { league } = await assertLeagueManagerOrOwner(userId, leagueId);
  ensureLeagueEditable(league);
  const member = await findLeagueTeamMemberById(memberId);
  if (!member || String(member.leagueTeamId) !== String(leagueTeamId)) {
    throw new ApiError(404, 'League member not found');
  }

  if (payload.status) {
    member.status = payload.status;
  }

  await saveLeagueTeamMember(member);
  const targetUser = await findUserById(member.userId);
  return sanitizeLeagueMember(
    member,
    new Map(targetUser ? [[String(targetUser._id), targetUser]] : [])
  );
}

async function removeLeagueMember(userId, leagueId, leagueTeamId, memberId) {
  const { league, role } = await assertTeamManagerOrOwner(userId, leagueId, leagueTeamId);
  ensureLeagueEditable(league);
  const member = await findLeagueTeamMemberById(memberId);
  if (!member || String(member.leagueTeamId) !== String(leagueTeamId)) {
    throw new ApiError(404, 'League member not found');
  }

  if (member.role === 'manager' && role !== 'owner' && role !== 'league_manager') {
    throw new ApiError(403, 'Only the league owner or a league manager can remove team managers');
  }

  member.status = 'removed';
  await saveLeagueTeamMember(member);
  const targetUser = await findUserById(member.userId);
  return sanitizeLeagueMember(
    member,
    new Map(targetUser ? [[String(targetUser._id), targetUser]] : [])
  );
}

async function createJoinRequest(userId, leagueId, leagueTeamId, payload) {
  const league = await assertLeagueExists(leagueId);
  ensureLeagueEditable(league);
  const team = await assertLeagueTeamExists(leagueId, leagueTeamId);
  const pending = await findPendingLeagueJoinRequest(team._id, userId, payload.requestedRole);
  if (pending) {
    throw new ApiError(409, 'A pending join request already exists');
  }

  if (payload.requestedRole === 'player') {
    const player = await findLeaguePlayerByIdAndTeam(payload.requestedLeaguePlayerId, leagueTeamId);
    if (!player || !player.isActive) {
      throw new ApiError(404, 'League player not found');
    }
    if (player.claimedByUserId) {
      throw new ApiError(409, 'Player slot is already claimed');
    }
  }

  const request = await createLeagueJoinRequest({
    leagueId,
    leagueTeamId,
    requesterUserId: userId,
    requestedRole: payload.requestedRole,
    requestedLeaguePlayerId: payload.requestedLeaguePlayerId ?? null,
    status: 'pending',
  });

  const requester = await findUserById(userId);
  return sanitizeLeagueJoinRequest(
    request,
    new Map(requester ? [[String(requester._id), requester]] : [])
  );
}

async function listJoinRequests(userId, leagueId, leagueTeamId) {
  await assertTeamManagerOrOwner(userId, leagueId, leagueTeamId);
  const requests = await listLeagueJoinRequests(leagueTeamId);
  const usersById = await buildUsersMap([
    ...requests.map((request) => request.requesterUserId),
    ...requests.map((request) => request.reviewedByUserId),
  ]);
  return requests.map((request) => sanitizeLeagueJoinRequest(request, usersById));
}

async function approveJoinRequest(userId, leagueId, leagueTeamId, requestId) {
  const { league } = await assertTeamManagerOrOwner(userId, leagueId, leagueTeamId);
  ensureLeagueEditable(league);
  const request = await findLeagueJoinRequestById(requestId);
  if (!request || String(request.leagueTeamId) !== String(leagueTeamId)) {
    throw new ApiError(404, 'Join request not found');
  }
  if (request.status !== 'pending') {
    throw new ApiError(400, 'Join request is no longer pending');
  }

  let member = await findActiveLeagueTeamMember(leagueTeamId, request.requesterUserId);
  if (request.requestedRole === 'team_manager') {
    if (member) {
      member.role = 'manager';
      member.leaguePlayerId = null;
      await saveLeagueTeamMember(member);
    } else {
      member = await createLeagueTeamMember({
        leagueId,
        leagueTeamId,
        userId: request.requesterUserId,
        role: 'manager',
        leaguePlayerId: null,
        createdByUserId: userId,
      });
    }
  } else if (request.requestedRole === 'helper') {
    if (member) {
      member.role = 'helper';
      member.leaguePlayerId = null;
      await saveLeagueTeamMember(member);
    } else {
      member = await createLeagueTeamMember({
        leagueId,
        leagueTeamId,
        userId: request.requesterUserId,
        role: 'helper',
        leaguePlayerId: null,
        createdByUserId: userId,
      });
    }
  } else {
    const player = await findLeaguePlayerById(request.requestedLeaguePlayerId);
    if (!player || String(player.leagueTeamId) !== String(leagueTeamId)) {
      throw new ApiError(404, 'League player not found');
    }
    if (player.claimedByUserId) {
      throw new ApiError(409, 'Player slot is already claimed');
    }

    player.claimedByUserId = request.requesterUserId;
    await saveLeaguePlayer(player);

    if (member) {
      member.role = 'player';
      member.leaguePlayerId = player._id;
      await saveLeagueTeamMember(member);
    } else {
      member = await createLeagueTeamMember({
        leagueId,
        leagueTeamId,
        userId: request.requesterUserId,
        role: 'player',
        leaguePlayerId: player._id,
        createdByUserId: userId,
      });
    }
  }

  request.status = 'approved';
  request.reviewedByUserId = userId;
  request.reviewedAt = new Date();
  await saveLeagueJoinRequest(request);

  const usersById = await buildUsersMap([request.requesterUserId, userId]);
  return sanitizeLeagueJoinRequest(request, usersById);
}

async function rejectJoinRequest(userId, leagueId, leagueTeamId, requestId) {
  const { league } = await assertTeamManagerOrOwner(userId, leagueId, leagueTeamId);
  ensureLeagueEditable(league);
  const request = await findLeagueJoinRequestById(requestId);
  if (!request || String(request.leagueTeamId) !== String(leagueTeamId)) {
    throw new ApiError(404, 'Join request not found');
  }
  if (request.status !== 'pending') {
    throw new ApiError(400, 'Join request is no longer pending');
  }

  request.status = 'rejected';
  request.reviewedByUserId = userId;
  request.reviewedAt = new Date();
  await saveLeagueJoinRequest(request);
  const usersById = await buildUsersMap([request.requesterUserId, userId]);
  return sanitizeLeagueJoinRequest(request, usersById);
}

async function cancelJoinRequest(userId, leagueId, leagueTeamId, requestId) {
  const request = await findLeagueJoinRequestById(requestId);
  if (
    !request ||
    String(request.leagueTeamId) !== String(leagueTeamId) ||
    String(request.requesterUserId) !== String(userId)
  ) {
    throw new ApiError(404, 'Join request not found');
  }
  if (request.status !== 'pending') {
    throw new ApiError(400, 'Join request is no longer pending');
  }

  request.status = 'canceled';
  await saveLeagueJoinRequest(request);
  const requester = await findUserById(userId);
  return sanitizeLeagueJoinRequest(
    request,
    new Map(requester ? [[String(requester._id), requester]] : [])
  );
}

async function unclaimLeaguePlayer(userId, leagueId, leagueTeamId, leaguePlayerId) {
  const { league } = await assertTeamManagerOrOwner(userId, leagueId, leagueTeamId);
  ensureLeagueEditable(league);
  const player = await findLeaguePlayerByIdAndTeam(leaguePlayerId, leagueTeamId);
  if (!player) {
    throw new ApiError(404, 'League player not found');
  }
  if (!player.claimedByUserId) {
    throw new ApiError(400, 'Player is not claimed');
  }

  const member = await findActiveLeagueTeamMember(leagueTeamId, player.claimedByUserId);
  player.claimedByUserId = null;
  await saveLeaguePlayer(player);

  if (member && member.role === 'player') {
    member.status = 'removed';
    await saveLeagueTeamMember(member);
  }

  return sanitizeLeaguePlayer(player);
}

// OPT-006: delegate to the shared player-line accumulator. League player rows
// do not carry a leaguePlayerId field, so it is omitted.
function emptyStats(playerId, displayName) {
  return createEmptyPlayerStatLine(playerId, displayName);
}

function applyEventToLine(line, statType) {
  applyEventToPlayerStatLine(line, statType);
}

function getLeagueGameTeamSide(game, leagueTeamId) {
  if (String(game.homeLeagueTeamId) === String(leagueTeamId)) {
    return TEAM_SIDES.HOME;
  }
  if (String(game.awayLeagueTeamId) === String(leagueTeamId)) {
    return TEAM_SIDES.AWAY;
  }
  return null;
}

function getLeagueGameScore(game) {
  if (game.trackingMode === 'dual_team') {
    // OPT-008: fast path — use the frozen finalScore when present (completed
    // games). For dual_team, finalScore's {home, away} maps directly to the
    // league home/away sides. Falls back to compute for legacy/in-progress games.
    if (game.finalScore && (game.finalScore.home != null || game.finalScore.away != null)) {
      return { homePoints: game.finalScore.home, awayPoints: game.finalScore.away };
    }
    const summary = summarizeEventsBySide(game.events || []);
    return {
      homePoints: summary[TEAM_SIDES.HOME].points,
      awayPoints: summary[TEAM_SIDES.AWAY].points,
    };
  }

  const trackedTeamId = game.trackedLeagueTeamId ? String(game.trackedLeagueTeamId) : null;
  const homeTeamId = game.homeLeagueTeamId ? String(game.homeLeagueTeamId) : null;

  if (!trackedTeamId || !homeTeamId) {
    return { homePoints: 0, awayPoints: 0 };
  }

  // OPT-008: fast path — the frozen finalScore stores {home: tracked-team points,
  // away: opponent points} (games.service computeGameFinalScore maps tracked→home).
  // Re-map onto the league's home/away sides using the tracked-team identity.
  // Falls back to compute for legacy/in-progress games with no finalScore.
  let trackedPoints;
  let opponentPoints;
  if (game.finalScore && (game.finalScore.home != null || game.finalScore.away != null)) {
    trackedPoints = game.finalScore.home;
    opponentPoints = game.finalScore.away;
  } else {
    const trackedSummary = summarizeEvents(game.events || []);
    trackedPoints = trackedSummary.points;
    opponentPoints = trackedSummary.opponentPoints || 0;
  }

  if (trackedTeamId === homeTeamId) {
    return { homePoints: trackedPoints, awayPoints: opponentPoints };
  }

  return { homePoints: opponentPoints, awayPoints: trackedPoints };
}

function getLeagueGameSnapshotForTeam(game, leagueTeamId) {
  if (game.trackingMode === 'dual_team') {
    const side = getLeagueGameTeamSide(game, leagueTeamId);
    if (!side) {
      return { side: null, rosterSnapshot: [], eventFilter: () => false };
    }

    return {
      side,
      rosterSnapshot:
        side === TEAM_SIDES.HOME ? game.homeRosterSnapshot || [] : game.awayRosterSnapshot || [],
      eventFilter: (event) => event.teamSide === side,
    };
  }

  if (String(game.trackedLeagueTeamId) !== String(leagueTeamId)) {
    return { side: null, rosterSnapshot: [], eventFilter: () => false };
  }

  return {
    side: getLeagueGameTeamSide(game, leagueTeamId),
    rosterSnapshot: game.rosterSnapshot || [],
    eventFilter: () => true,
  };
}

function createLeagueGameRow(game, teamsById) {
  const score = getLeagueGameScore(game);
  const isCompleted = game.status === 'completed';

  return {
    id: String(game._id),
    leagueId: String(game.leagueId),
    title: game.title,
    gameContext: game.gameContext,
    trackingMode: game.trackingMode || 'one_sided',
    status: game.status,
    scheduledAt: game.scheduledAt ?? null,
    completedAt: game.completedAt ?? null,
    homeLeagueTeamId: game.homeLeagueTeamId ? String(game.homeLeagueTeamId) : null,
    awayLeagueTeamId: game.awayLeagueTeamId ? String(game.awayLeagueTeamId) : null,
    trackedLeagueTeamId: game.trackedLeagueTeamId ? String(game.trackedLeagueTeamId) : null,
    homeTeamName: teamsById.get(String(game.homeLeagueTeamId))?.name || null,
    awayTeamName: teamsById.get(String(game.awayLeagueTeamId))?.name || null,
    homeTeamLogoUrl: transformCloudinaryUrl(
      teamsById.get(String(game.homeLeagueTeamId))?.logo?.url || null
    ),
    awayTeamLogoUrl: transformCloudinaryUrl(
      teamsById.get(String(game.awayLeagueTeamId))?.logo?.url || null
    ),
    homePoints: isCompleted ? score.homePoints : null,
    awayPoints: isCompleted ? score.awayPoints : null,
    teamPoints: isCompleted ? score.homePoints : null,
    opponentPoints: isCompleted ? score.awayPoints : null,
  };
}

function buildLeagueTeamPlayerStats(games, leagueTeamId, currentPlayers = []) {
  const snapshotMap = new Map();
  const currentPlayersById = new Map(
    currentPlayers.map((player) => [
      String(player.leaguePlayerId || player._id),
      {
        displayName: player.displayName,
        jerseyNumber: player.jerseyNumber ?? null,
        position: player.position ?? null,
      },
    ])
  );

  for (const game of games) {
    const { rosterSnapshot, eventFilter } = getLeagueGameSnapshotForTeam(game, leagueTeamId);
    if (!rosterSnapshot.length) {
      continue;
    }

    for (const player of rosterSnapshot) {
      const key = String(player.leaguePlayerId || player._id);
      if (!snapshotMap.has(key)) {
        snapshotMap.set(key, emptyStats(key, player.displayName));
      }
    }

    for (const event of game.events || []) {
      if (!event.playerId || !eventFilter(event)) {
        continue;
      }
      const snapshotPlayer = rosterSnapshot.find(
        (player) => String(player._id) === String(event.playerId)
      );
      const key = String(snapshotPlayer?.leaguePlayerId || event.playerId);
      if (!snapshotMap.has(key)) {
        snapshotMap.set(key, emptyStats(key, `Unknown (${key.slice(-6)})`));
      }
      applyEventToLine(snapshotMap.get(key), event.statType);
    }
  }

  return Array.from(snapshotMap.values())
    .map((line) => {
      const currentPlayer = currentPlayersById.get(String(line.playerId));
      if (!currentPlayer) {
        return line;
      }

      return {
        ...line,
        displayName: currentPlayer.displayName,
        jerseyNumber: currentPlayer.jerseyNumber,
        position: currentPlayer.position,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// OPT-005: accepts optional pre-fetched teams/games so callers that already
// loaded them (league detail compositions) don't re-query. Falls back to
// loading when not provided — behaviour is identical either way.
async function listLeagueGames(
  leagueId,
  // publicOnly is accepted but intentionally unused (see OPT-024) — kept in the
  // signature so existing callers behave exactly as before.
  { teams: prefetchedTeams, games: prefetchedGames } = {}
) {
  const games = prefetchedGames ?? (await listLeagueGamesByLeagueId(leagueId));
  const teams = prefetchedTeams ?? (await listLeagueTeams(leagueId));
  const byId = new Map(teams.map((team) => [String(team._id), team]));

  return games.map((game) => createLeagueGameRow(game, byId));
}

// OPT-010: the pure LIVE standings compute (the source of truth). Renamed from
// getLeagueStandings; the public getLeagueStandings is now a materialised read
// that falls back to this. OPT-005: same pre-fetch escape hatch as listLeagueGames.
async function computeLeagueStandings(
  leagueId,
  { teams: prefetchedTeams, games: prefetchedGames } = {}
) {
  const [teams, games] = await Promise.all([
    prefetchedTeams ?? listLeagueTeams(leagueId),
    prefetchedGames ?? listLeagueGamesByLeagueId(leagueId),
  ]);
  const rows = new Map(
    teams.map((team) => [
      String(team._id),
      {
        teamId: String(team._id),
        teamName: team.name,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        winPct: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0,
      },
    ])
  );

  for (const game of games) {
    if (game.status !== 'completed') {
      continue;
    }
    if (!game.homeLeagueTeamId || !game.awayLeagueTeamId) {
      continue;
    }

    const homeTeamId = String(game.homeLeagueTeamId);
    const awayTeamId = String(game.awayLeagueTeamId);
    const homeRow = rows.get(homeTeamId);
    const awayRow = rows.get(awayTeamId);
    if (!homeRow || !awayRow) {
      continue;
    }

    const { homePoints, awayPoints } = getLeagueGameScore(game);

    homeRow.gamesPlayed += 1;
    homeRow.pointsFor += homePoints;
    homeRow.pointsAgainst += awayPoints;
    homeRow.pointDiff = homeRow.pointsFor - homeRow.pointsAgainst;

    awayRow.gamesPlayed += 1;
    awayRow.pointsFor += awayPoints;
    awayRow.pointsAgainst += homePoints;
    awayRow.pointDiff = awayRow.pointsFor - awayRow.pointsAgainst;

    if (homePoints >= awayPoints) {
      homeRow.wins += 1;
      awayRow.losses += 1;
    } else {
      homeRow.losses += 1;
      awayRow.wins += 1;
    }
  }

  for (const row of rows.values()) {
    row.winPct = row.gamesPlayed > 0 ? row.wins / row.gamesPlayed : 0;
    row.record = `${row.wins}-${row.losses}`;
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    if (b.winPct !== a.winPct) return b.winPct - a.winPct;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    return a.teamName.localeCompare(b.teamName);
  });
}

// OPT-010: materialised standings read. Serves the pre-computed rows from
// `leaguestandings`; on a miss (new league, never-recomputed, or after a manual
// wipe) it computes live, persists, and returns — self-backfilling and fully
// reversible (deleting the collection just makes every read compute-on-miss).
// When the caller passes pre-fetched teams/games (league-detail compositions) we
// skip the materialised read and compute directly from that in-hand data, since
// it's already loaded and avoids any staleness within a single request.
async function getLeagueStandings(leagueId, prefetch = {}) {
  if (prefetch.teams || prefetch.games) {
    return computeLeagueStandings(leagueId, prefetch);
  }

  const materialised = await findLeagueStandings(leagueId);
  if (materialised && Array.isArray(materialised.rows)) {
    return materialised.rows;
  }

  const rows = await computeLeagueStandings(leagueId);
  try {
    await upsertLeagueStandings(leagueId, rows);
  } catch (error) {
    // Persisting the backfill is best-effort — the computed rows are still
    // correct to return even if the write races/fails.
    logger.warn({ err: error, leagueId: String(leagueId) }, 'Standings backfill persist failed');
  }
  return rows;
}

// OPT-011: pure live compute for per-player RAW totals across every team in the
// league (gamesCount + the OPT-006 player-stat-line fields). This is the single
// source of truth both the materialised write path AND any live fallback use.
// Deliberately returns raw totals only — ppg/fantasy/DPOY scores are derived at
// read time (see deriveLeaguePlayerScores) so tuning those formulas never
// requires a recompute.
async function computeLeaguePlayerStats(
  leagueId,
  { teams: prefetchedTeams, games: prefetchedGames } = {}
) {
  const [teams, games] = await Promise.all([
    prefetchedTeams ?? listLeagueTeams(leagueId),
    prefetchedGames ?? listLeagueGamesByLeagueId(leagueId),
  ]);
  const completedGames = games.filter((g) => g.status === 'completed');

  const rowsByKey = new Map();

  for (const team of teams) {
    const leagueTeamId = String(team._id);

    for (const game of completedGames) {
      const { rosterSnapshot, eventFilter } = getLeagueGameSnapshotForTeam(game, team._id);
      if (!rosterSnapshot.length) continue;

      for (const snapshotPlayer of rosterSnapshot) {
        const leaguePlayerId = String(snapshotPlayer.leaguePlayerId || snapshotPlayer._id);
        const key = `${leagueTeamId}:${leaguePlayerId}`;
        if (!rowsByKey.has(key)) {
          rowsByKey.set(key, {
            leagueTeamId,
            leaguePlayerId,
            ...createEmptyPlayerStatLine(leaguePlayerId, snapshotPlayer.displayName),
            gamesCount: 0,
          });
        }
        rowsByKey.get(key).gamesCount += 1;
      }

      for (const event of game.events || []) {
        if (!event.playerId || !eventFilter(event)) continue;
        const snapshotPlayer = rosterSnapshot.find((p) => String(p._id) === String(event.playerId));
        if (!snapshotPlayer) continue;
        const leaguePlayerId = String(snapshotPlayer.leaguePlayerId || event.playerId);
        const key = `${leagueTeamId}:${leaguePlayerId}`;
        const row = rowsByKey.get(key);
        if (row) {
          applyEventToPlayerStatLine(row, event.statType);
        }
      }
    }
  }

  return Array.from(rowsByKey.values()).filter((row) => row.gamesCount > 0);
}

// OPT-011: derive the tunable, weight-dependent scores (ppg/fantasy/DPOY etc.)
// from a raw materialised (or live-computed) row. Kept separate from the
// persisted data on purpose — changing these formulas needs no recompute.
function deriveLeaguePlayerScores(row) {
  const { gamesCount, ...stats } = row;
  const ppg = stats.points / gamesCount;
  const rpg = stats.reb / gamesCount;
  const apg = stats.ast / gamesCount;
  const spg = stats.stl / gamesCount;
  const bpg = (stats.blk || 0) / gamesCount;
  const topg = stats.tov / gamesCount;
  const fgMade = (stats.fg2m || 0) + (stats.fg3m || 0);
  const fgAttempted = (stats.fg2a || 0) + (stats.fg3a || 0);
  const fantasyScore = ppg * 1 + rpg * 1.2 + apg * 1.5 + spg * 2 + bpg * 2 + topg * -1;
  const defensiveScore = rpg * 1.2 + spg * 3 + bpg * 3 + topg * -1;

  return {
    ppg,
    rpg,
    apg,
    spg,
    bpg,
    topg,
    fgMade,
    fgAttempted,
    fgPercentage: fgAttempted > 0 ? fgMade / fgAttempted : null,
    fantasyScore,
    defensiveScore,
  };
}

// OPT-011: materialised league-WIDE player stats read (all teams — used by
// leaders/DPOY, the O(T×G×E×R) unauthenticated hot path the roadmap flagged).
// getPublicLeagueTeamBySlug's team-scoped stats intentionally stay on live
// compute (buildLeagueTeamPlayerStats) — it's already scoped to one team's
// games (cheap) and includes zero-game roster players, a shape materialising
// here would either drop or require a roster-change recompute trigger for.
async function getLeaguePlayerStats(leagueId, prefetch = {}) {
  if (prefetch.teams || prefetch.games) {
    return computeLeaguePlayerStats(leagueId, prefetch);
  }

  const materialised = await listLeaguePlayerStats(leagueId);
  if (materialised.length > 0) {
    return materialised;
  }

  const rows = await computeLeaguePlayerStats(leagueId);
  if (rows.length > 0) {
    try {
      await replaceLeaguePlayerStats(leagueId, rows);
    } catch (error) {
      logger.warn(
        { err: error, leagueId: String(leagueId) },
        'Player stats backfill persist failed'
      );
    }
  }
  return rows;
}

// OPT-010: recompute + persist all materialised league aggregates. Today that is
// standings; OPT-011 will extend this to player stats. Reuses the live compute
// (which reuses OPT-006's shared accumulator) so materialised == live by
// construction. Guarded by a per-league in-flight map so overlapping triggers
// (e.g. finish + immediate edit) coalesce instead of racing.
const recomputeInFlight = new Map();

async function recomputeLeagueAggregates(leagueId) {
  const key = String(leagueId);
  const inFlight = recomputeInFlight.get(key);
  if (inFlight) {
    // A recompute is mid-flight and read its data BEFORE the write that
    // triggered this call — coalescing alone would drop that write. Mark the
    // entry dirty so one follow-up pass runs when the current one finishes
    // (verification fix, 2026-07-06).
    inFlight.dirty = true;
    return inFlight.promise;
  }

  const entry = { dirty: false };
  entry.promise = (async () => {
    // OPT-011: fetch teams/games once, reuse for both standings and player
    // stats — avoids doubling the DB reads this recompute pass needs.
    const [teams, games] = await Promise.all([
      listLeagueTeams(leagueId),
      listLeagueGamesByLeagueId(leagueId),
    ]);
    const prefetch = { teams, games };

    const [standingsRows, playerStatsRows] = await Promise.all([
      computeLeagueStandings(leagueId, prefetch),
      computeLeaguePlayerStats(leagueId, prefetch),
    ]);

    await Promise.all([
      upsertLeagueStandings(leagueId, standingsRows),
      replaceLeaguePlayerStats(leagueId, playerStatsRows),
    ]);

    return { standingsRows, playerStatsRows };
  })();

  recomputeInFlight.set(key, entry);
  try {
    const result = await entry.promise;
    return result.standingsRows;
  } finally {
    recomputeInFlight.delete(key);
    if (entry.dirty) {
      // Re-run once to pick up writes that landed mid-flight.
      recomputeLeagueAggregates(leagueId).catch((error) => {
        logger.error(
          { err: error, leagueId: String(leagueId) },
          'Dirty-flag league aggregate recompute failed'
        );
      });
    }
  }
}

// OPT-010: fire a recompute AFTER the response, never blocking the request that
// triggered it. Failures are logged, not thrown (the live-compute fallback keeps
// reads correct even if a recompute is missed).
function scheduleLeagueAggregateRecompute(leagueId) {
  if (!leagueId) return;
  setImmediate(() => {
    recomputeLeagueAggregates(leagueId).catch((error) => {
      logger.error(
        { err: error, leagueId: String(leagueId) },
        'Post-response league aggregate recompute failed'
      );
    });
  });
}

function buildLeagueRosterSnapshot(players) {
  return (players || [])
    .filter((player) => player.isActive)
    .map((player) => ({
      leaguePlayerId: player._id,
      displayName: player.displayName,
      jerseyNumber: player.jerseyNumber ?? null,
      position: normalizePosition(player.position),
      claimedByUserId: player.claimedByUserId ?? null,
      isClaimed: Boolean(player.claimedByUserId),
      isActive: Boolean(player.isActive),
    }));
}

async function getLeagueRosterSnapshotForTeam(leagueTeamId) {
  const players = await listLeaguePlayers(leagueTeamId);
  return buildLeagueRosterSnapshot(players);
}

async function getLeagueContextForGame(userId, payload, options = {}) {
  if (!mongoose.Types.ObjectId.isValid(payload.leagueId)) {
    throw new ApiError(400, 'Invalid league id');
  }

  const league = await assertLeagueExists(payload.leagueId);
  const isOwner = String(league.ownerUserId) === String(userId);

  const leagueMgrRecord = isOwner ? null : await findActiveLeagueManager(payload.leagueId, userId);
  const isLeagueMgr = Boolean(leagueMgrRecord);

  if (!isOwner && !isLeagueMgr && !options.allowManager) {
    throw new ApiError(403, 'Forbidden');
  }

  const [homeTeam, awayTeam, trackedTeam, trackedPlayers] = await Promise.all([
    assertLeagueTeamExists(payload.leagueId, payload.homeLeagueTeamId),
    assertLeagueTeamExists(payload.leagueId, payload.awayLeagueTeamId),
    assertLeagueTeamExists(payload.leagueId, payload.trackedLeagueTeamId),
    listLeaguePlayers(payload.trackedLeagueTeamId),
  ]);

  if (String(homeTeam._id) === String(awayTeam._id)) {
    throw new ApiError(400, 'Home and away teams must be different');
  }

  if (
    String(trackedTeam._id) !== String(homeTeam._id) &&
    String(trackedTeam._id) !== String(awayTeam._id)
  ) {
    throw new ApiError(400, 'Tracked team must be either the home or away team');
  }

  if (!isOwner && !isLeagueMgr) {
    const teamMgr = await isTeamManager(userId, trackedTeam._id);
    if (!teamMgr) {
      throw new ApiError(403, 'Forbidden');
    }
  }

  return {
    league,
    homeTeam,
    awayTeam,
    trackedTeam,
    rosterSnapshot: buildLeagueRosterSnapshot(trackedPlayers),
  };
}

async function getLeagueTeamRosterSnapshotForGame(game) {
  const league = await assertLeagueExists(game.leagueId);
  const trackedTeam = await assertLeagueTeamExists(game.leagueId, game.trackedLeagueTeamId);

  return {
    league,
    trackedTeam,
    team: {
      _id: trackedTeam._id,
      name: trackedTeam.name,
      logo: trackedTeam.logo,
      players: (game.rosterSnapshot || []).map((player) => ({
        _id: player._id,
        displayName: player.displayName,
        jerseyNumber: player.jerseyNumber ?? null,
        position: player.position ?? null,
        isActive: true,
      })),
      plan: 'pro',
      subscriptionStatus: 'active',
    },
  };
}

async function addLeagueManagerByEmail(userId, leagueId, email) {
  const league = await assertLeagueOwner(userId, leagueId);
  ensureLeagueEditable(league);
  const targetUser = await findUserByEmail(email);
  if (!targetUser) {
    throw new ApiError(404, 'No account found for that email address');
  }

  if (String(league.ownerUserId) === String(targetUser._id)) {
    throw new ApiError(400, 'That user is already the league owner');
  }

  let record = await findActiveLeagueManager(leagueId, targetUser._id);
  if (record) {
    throw new ApiError(409, 'That user is already a league manager');
  }

  record = await createLeagueManager({
    leagueId,
    userId: targetUser._id,
    createdByUserId: userId,
  });

  return sanitizeLeagueManager(record, new Map([[String(targetUser._id), targetUser]]));
}

async function listLeagueManagersForLeague(userId, leagueId) {
  await assertLeagueParticipant(userId, leagueId);
  const managers = await listLeagueManagersByLeague(leagueId);
  const usersById = await buildUsersMap(managers.map((m) => m.userId));
  return managers.map((m) => sanitizeLeagueManager(m, usersById));
}

async function removeLeagueManagerById(userId, leagueId, managerId) {
  if (!mongoose.Types.ObjectId.isValid(managerId)) {
    throw new ApiError(404, 'League manager not found');
  }
  await assertLeagueOwner(userId, leagueId);
  const record = await findLeagueManagerById(managerId);
  if (!record || String(record.leagueId) !== String(leagueId) || record.status !== 'active') {
    throw new ApiError(404, 'League manager not found');
  }

  record.status = 'removed';
  await saveLeagueManager(record);
  const targetUser = await findUserById(record.userId);
  return sanitizeLeagueManager(
    record,
    new Map(targetUser ? [[String(targetUser._id), targetUser]] : [])
  );
}

async function canManageLeagueGame(userId, game) {
  const league = await assertLeagueExists(game.leagueId);
  if (String(league.ownerUserId) === String(userId)) {
    return true;
  }

  const leagueMgr = await findActiveLeagueManager(game.leagueId, userId);
  if (leagueMgr) {
    return true;
  }

  const managerChecks = await Promise.all([
    game.homeLeagueTeamId ? isTeamManager(userId, game.homeLeagueTeamId) : Promise.resolve(false),
    game.awayLeagueTeamId ? isTeamManager(userId, game.awayLeagueTeamId) : Promise.resolve(false),
  ]);

  return managerChecks.some(Boolean);
}

async function canFinalizeLeagueGame(userId, game) {
  const league = await assertLeagueExists(game.leagueId);
  if (String(league.ownerUserId) === String(userId)) {
    return true;
  }

  const leagueMgr = await findActiveLeagueManager(game.leagueId, userId);
  return Boolean(leagueMgr);
}

async function canEditCompletedLeagueGame(userId, game) {
  if (!userId || game.gameContext !== 'league' || !game.leagueId) return false;
  const league = await findLeagueById(game.leagueId);
  if (!league || league.status !== 'active') return false;

  if (String(league.ownerUserId) === String(userId)) return true;

  const leagueMgr = await findActiveLeagueManager(game.leagueId, userId);
  if (leagueMgr) return true;

  const managerChecks = await Promise.all([
    game.homeLeagueTeamId ? isTeamManager(userId, game.homeLeagueTeamId) : Promise.resolve(false),
    game.awayLeagueTeamId ? isTeamManager(userId, game.awayLeagueTeamId) : Promise.resolve(false),
    game.trackedLeagueTeamId
      ? isTeamManager(userId, game.trackedLeagueTeamId)
      : Promise.resolve(false),
  ]);

  return managerChecks.some(Boolean);
}

async function getPublicLeagueLeaders(leagueSlug, limit = 10) {
  const league = await assertLeagueVisible(leagueSlug, { bySlug: true });
  // OPT-011: raw per-player totals come from the materialised read (indexed
  // find, self-backfilling) instead of replaying every team's games/events.
  const [teams, playerStatRows] = await Promise.all([
    listLeagueTeams(league._id),
    getLeaguePlayerStats(league._id),
  ]);
  const allPlayers = (
    await Promise.all(teams.map((team) => listLeaguePlayers(team._id).catch(() => [])))
  ).flat();
  const usersById = await buildUsersMap(allPlayers.map((p) => p.claimedByUserId));
  const currentPlayersById = new Map(
    allPlayers.map((player) => [
      String(player.leaguePlayerId || player._id),
      {
        displayName: player.displayName,
        jerseyNumber: player.jerseyNumber ?? null,
        position: player.position ?? null,
        avatarUrl: player.claimedByUserId
          ? transformCloudinaryUrl(
              usersById.get(String(player.claimedByUserId))?.avatar?.url || null
            )
          : null,
      },
    ])
  );
  const teamsById = new Map(teams.map((t) => [String(t._id), t]));

  const allLeaders = playerStatRows.map((row) => {
    const scores = deriveLeaguePlayerScores(row);
    // Materialised rows come back from Mongo (.lean()) with ObjectId ids while
    // live-computed rows carry strings — normalise before the Map lookups, or
    // teamName/jersey/avatar silently null out on the materialised path
    // (verification bug found 2026-07-06).
    const leagueTeamId = String(row.leagueTeamId);
    const leaguePlayerId = String(row.leaguePlayerId);
    const team = teamsById.get(leagueTeamId);
    const currentPlayer = currentPlayersById.get(leaguePlayerId);
    return {
      leaguePlayerId,
      displayName: currentPlayer?.displayName || row.displayName,
      jerseyNumber: currentPlayer?.jerseyNumber ?? null,
      position: currentPlayer?.position ?? null,
      avatarUrl: currentPlayer?.avatarUrl || null,
      teamName: team?.name || null,
      teamSlug: team?.slug || null,
      teamLogoUrl: transformCloudinaryUrl(team?.logo?.url || null),
      gamesCount: row.gamesCount,
      ...scores,
    };
  });

  const leaders = allLeaders.sort((a, b) => b.fantasyScore - a.fantasyScore).slice(0, limit);
  const dpoyLeaders = [...allLeaders]
    .sort((a, b) => b.defensiveScore - a.defensiveScore)
    .slice(0, limit);

  return { leaders, dpoyLeaders };
}

module.exports = {
  createLeagueForUser,
  listLeaguesForUser,
  listPublicLeagues,
  getLeagueForUser,
  getPublicLeagueBySlug,
  getPublicLeaguePlayerBySlug,
  updateLeagueForUser,
  archiveLeagueForUser,
  createLeagueTeamForLeague,
  listTeamsForLeagueViewer,
  getLeagueTeamForUser,
  getPublicLeagueTeamBySlug,
  updateLeagueTeamForLeague,
  archiveLeagueTeamForLeague,
  uploadLeagueLogo,
  removeLeagueLogo,
  uploadLeagueTeamLogo,
  removeLeagueTeamLogo,
  addPlayerToLeagueTeam,
  updateLeaguePlayer,
  removeLeaguePlayer,
  listLeagueMembersForTeam,
  addManagerByEmail,
  updateLeagueMember,
  removeLeagueMember,
  createJoinRequest,
  listJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  cancelJoinRequest,
  unclaimLeaguePlayer,
  listLeagueGames,
  getLeagueStandings,
  computeLeagueStandings,
  computeLeaguePlayerStats,
  deriveLeaguePlayerScores,
  getLeaguePlayerStats,
  recomputeLeagueAggregates,
  scheduleLeagueAggregateRecompute,
  getLeagueContextForGame,
  getLeagueRosterSnapshotForTeam,
  getLeagueTeamRosterSnapshotForGame,
  canManageLeagueGame,
  canFinalizeLeagueGame,
  canEditCompletedLeagueGame,
  addLeagueManagerByEmail,
  listLeagueManagersForLeague,
  removeLeagueManagerById,
  getPublicLeagueLeaders,
  getMyLeagueProfiles,
};
