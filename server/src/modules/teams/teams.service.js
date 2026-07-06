const mongoose = require('mongoose');
const { ApiError } = require('../../utils/apiError');
const {
  summarizeEvents,
  createEmptyTeamStatSummary,
  applyEventToTeamStatSummary,
  finalizeTeamStatSummary,
} = require('../shared/statSummary');
const {
  createTeam,
  listTeamsByOwner,
  findTeamByIdAndOwner,
  findTeamById,
  listTeams,
  saveTeam,
  findTeamSeasonSummary,
  upsertTeamSeasonSummary,
} = require('./teams.repository');
const { listGamesByTeamId, listPublicCompletedGames } = require('../games/games.repository');
const { computeBoxScore } = require('../games/games.service');
const { logger } = require('../../config/logger');
const {
  getBillingSummary,
  getTeamEntitlements,
  assertTeamCreationAllowed,
} = require('../billing/billing.service');
const {
  uploadImageBuffer,
  destroyImage,
  isCloudinaryConfigured,
} = require('../feed/cloudinary.client');
const { transformCloudinaryUrl } = require('../shared/cloudinaryUrl');
const { env } = require('../../config/env');

const PLAYER_POSITIONS = new Set(['PG', 'SG', 'SF', 'PF', 'C']);
const TEAM_LOGO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

function slugifyOpponentName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function opponentDisplayNameFromSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sanitizeTeam(team) {
  return {
    id: String(team._id),
    name: team.name,
    ownerUserId: String(team.ownerUserId),
    logo: sanitizeLogo(team.logo),
    colors: Array.isArray(team.colors) ? team.colors.map(normalizeHexColor).filter(Boolean) : [],
    homeVenue: sanitizeVenue(team.homeVenue),
    billing: getBillingSummary(team),
    entitlements: getTeamEntitlements(team),
    players: team.players.map((player) => ({
      id: String(player._id),
      displayName: player.displayName,
      jerseyNumber: player.jerseyNumber ?? null,
      position: normalizePlayerPosition(player.position),
      isActive: Boolean(player.isActive),
    })),
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
  };
}

function normalizeHexColor(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

function normalizePlayerPosition(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return PLAYER_POSITIONS.has(normalized) ? normalized : null;
}

function normalizeVenue(input) {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const normalized = {
    arenaName: String(input.arenaName || '').trim(),
    addressLine1: String(input.addressLine1 || '').trim(),
    addressLine2: String(input.addressLine2 || '').trim(),
    city: String(input.city || '').trim(),
    state: String(input.state || '').trim(),
    postalCode: String(input.postalCode || '').trim(),
    country: String(input.country || '').trim(),
  };

  const hasAnyValue = Object.values(normalized).some(Boolean);
  if (!hasAnyValue) {
    return null;
  }

  return normalized;
}

function sanitizeVenue(input) {
  const normalized = normalizeVenue(input);
  if (!normalized) {
    return null;
  }

  return {
    arenaName: normalized.arenaName,
    addressLine1: normalized.addressLine1,
    addressLine2: normalized.addressLine2 || null,
    city: normalized.city,
    state: normalized.state,
    postalCode: normalized.postalCode,
    country: normalized.country,
  };
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

function ensureNoDuplicatePlayers(players) {
  const seen = new Set();
  for (const player of players) {
    const key = normalizeName(player.displayName);
    if (seen.has(key)) {
      throw new ApiError(400, `Duplicate player name: ${player.displayName}`);
    }
    seen.add(key);
  }
}

function computeTeamPoints(game) {
  return summarizeEvents(game.events).points;
}

function computeOpponentPoints(game) {
  return summarizeEvents(game.events).opponentPoints || 0;
}

function isGamePubliclyViewable(game) {
  const now = Date.now();
  const scheduledTime = game.scheduledAt ? new Date(game.scheduledAt).getTime() : null;
  const isFuture =
    typeof scheduledTime === 'number' && !Number.isNaN(scheduledTime) && scheduledTime > now;

  return !isFuture;
}

function sanitizePublicGame(game) {
  return {
    id: String(game._id),
    title: game.title,
    opponent: game.opponent ?? null,
    videoUrl: game.videoUrl ?? null,
    hasVideo: Boolean(game.videoUrl),
    status: game.status,
    scheduledAt: game.scheduledAt ?? null,
    completedAt: game.completedAt ?? null,
    teamPoints: game.status === 'completed' ? computeTeamPoints(game) : null,
    opponentPoints: game.status === 'completed' ? computeOpponentPoints(game) : null,
    isPubliclyViewable: isGamePubliclyViewable(game),
    createdAt: game.createdAt,
  };
}

function publicGameTimeValue(game) {
  const rawValue = game.scheduledAt || game.completedAt || game.createdAt || null;
  if (!rawValue) {
    return Number.NEGATIVE_INFINITY;
  }

  const parsed = new Date(rawValue).getTime();
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function sanitizePublicPlayer(player) {
  return {
    id: String(player._id),
    displayName: player.displayName,
    jerseyNumber: player.jerseyNumber ?? null,
    position: normalizePlayerPosition(player.position),
  };
}

function buildTeamLookup(teams) {
  return new Map(
    (teams || []).map((team) => [
      normalizeName(team.name),
      { id: String(team._id), name: team.name },
    ])
  );
}

function buildOpponentDestination(opponentName, teamLookup) {
  if (!opponentName) {
    return {
      kind: 'none',
      href: null,
      label: 'Opponent TBD',
      teamId: null,
      opponentSlug: null,
    };
  }

  const matchedTeam = teamLookup.get(normalizeName(opponentName));
  if (matchedTeam) {
    return {
      kind: 'team',
      href: `/teams/${matchedTeam.id}`,
      label: matchedTeam.name,
      teamId: matchedTeam.id,
      opponentSlug: null,
    };
  }

  const opponentSlug = slugifyOpponentName(opponentName);
  return {
    kind: 'opponent_placeholder',
    href: opponentSlug ? `/opponents/${opponentSlug}` : null,
    label: opponentName,
    teamId: null,
    opponentSlug: opponentSlug || null,
  };
}

function findPlayerById(team, playerId) {
  if (typeof team.players?.id === 'function') {
    return team.players.id(playerId);
  }

  return (team.players || []).find((player) => String(player._id) === String(playerId)) || null;
}

function buildPublicTeamSummary(games, team) {
  const includedGames = games.filter(
    (game) => game.status === 'completed' && isGamePubliclyViewable(game)
  );
  const gamesCount = includedGames.length;

  const totals = createEmptyTeamStatSummary();

  for (const game of includedGames) {
    for (const event of game.events) {
      applyEventToTeamStatSummary(totals, event.statType);
    }
  }

  const boxScore = computeBoxScore(
    {
      events: includedGames.flatMap((game) => game.events || []),
    },
    team,
    { includeInactivePlayers: true }
  );

  const playersById = new Map((team.players || []).map((player) => [String(player._id), player]));
  const playerSummaries = boxScore.players.map((row) => ({
    ...row,
    position: normalizePlayerPosition(playersById.get(String(row.playerId))?.position),
    gamesPlayed: gamesCount,
    pointsPerGame: gamesCount > 0 ? row.points / gamesCount : 0,
    assistsPerGame: gamesCount > 0 ? row.ast / gamesCount : 0,
    reboundsPerGame: gamesCount > 0 ? row.reb / gamesCount : 0,
    stealsPerGame: gamesCount > 0 ? row.stl / gamesCount : 0,
    turnoversPerGame: gamesCount > 0 ? row.tov / gamesCount : 0,
    foulsPerGame: gamesCount > 0 ? row.foul / gamesCount : 0,
  }));

  return {
    gamesCount,
    ...finalizeTeamStatSummary(totals),
    boxScore: {
      ...boxScore,
      players: playerSummaries,
    },
  };
}

// OPT-013: pure live compute — the source of truth both the materialised read
// AND recompute hook reuse. Fetches its own games/team so it can be called from
// a write-trigger context that doesn't already have them loaded.
async function computeTeamSeasonSummary(
  teamId,
  { team: prefetchedTeam, games: prefetchedGames } = {}
) {
  const [team, games] = await Promise.all([
    prefetchedTeam ?? findTeamById(teamId),
    prefetchedGames ?? listGamesByTeamId(teamId),
  ]);
  if (!team) {
    return null;
  }
  return buildPublicTeamSummary(games, team);
}

// OPT-013: materialised read. Serves the pre-computed summary from
// `teamseasonsummaries`; on a miss it computes live, persists, and returns
// (self-backfilling, reversible — mirrors OPT-010's getLeagueStandings).
// Callers that already loaded team/games for other parts of their response
// (e.g. getPublicTeam needs both regardless) can pass them via `prefetch` —
// used ONLY on a miss, to skip a redundant re-fetch; the materialised check
// itself always runs first so the O(G×E) compute is still avoided on a hit.
async function getTeamSeasonSummary(teamId, prefetch = {}) {
  const materialised = await findTeamSeasonSummary(teamId);
  if (materialised && materialised.summary) {
    return materialised.summary;
  }

  const summary = await computeTeamSeasonSummary(teamId, prefetch);
  if (summary) {
    try {
      await upsertTeamSeasonSummary(teamId, summary);
    } catch (error) {
      logger.warn(
        { err: error, teamId: String(teamId) },
        'Team season summary backfill persist failed'
      );
    }
  }
  return summary;
}

// OPT-013: recompute + persist hook, fired post-response from game-completion
// triggers on standalone (non-league) teams. Per-team in-flight guard coalesces
// overlapping triggers, same pattern as OPT-010's recomputeLeagueAggregates.
const recomputeTeamSummaryInFlight = new Map();

async function recomputeTeamSeasonSummary(teamId) {
  const key = String(teamId);
  const inFlight = recomputeTeamSummaryInFlight.get(key);
  if (inFlight) {
    // Same dirty-flag pattern as recomputeLeagueAggregates: a mid-flight pass
    // read its data before the write that triggered this call, so coalescing
    // alone would drop it — re-run once after (verification fix, 2026-07-06).
    inFlight.dirty = true;
    return inFlight.promise;
  }

  const entry = { dirty: false };
  entry.promise = (async () => {
    const summary = await computeTeamSeasonSummary(teamId);
    if (summary) {
      await upsertTeamSeasonSummary(teamId, summary);
    }
    return summary;
  })();

  recomputeTeamSummaryInFlight.set(key, entry);
  try {
    return await entry.promise;
  } finally {
    recomputeTeamSummaryInFlight.delete(key);
    if (entry.dirty) {
      recomputeTeamSeasonSummary(teamId).catch((error) => {
        logger.error(
          { err: error, teamId: String(teamId) },
          'Dirty-flag team season summary recompute failed'
        );
      });
    }
  }
}

function scheduleTeamSeasonSummaryRecompute(teamId) {
  if (!teamId) return;
  setImmediate(() => {
    recomputeTeamSeasonSummary(teamId).catch((error) => {
      logger.error(
        { err: error, teamId: String(teamId) },
        'Post-response team season summary recompute failed'
      );
    });
  });
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

function buildPlayerHighlights(games, playerIdStr) {
  return games
    .filter((game) => game.videoUrl)
    .flatMap((game) =>
      (game.events || [])
        .filter(
          (ev) =>
            ev.playerId &&
            String(ev.playerId) === playerIdStr &&
            HIGHLIGHT_STAT_TYPES.has(ev.statType) &&
            typeof ev.videoTimestamp === 'number'
        )
        .map((ev) => ({
          eventId: String(ev._id),
          statType: ev.statType,
          videoTimestamp: ev.videoTimestamp,
          videoUrl: game.videoUrl,
          gameTitle: game.title || game.opponent || null,
        }))
    );
}

function buildPublicPlayerGameRows(games, team, player, teamLookup = new Map()) {
  return games
    .filter((game) => game.status === 'completed' && isGamePubliclyViewable(game))
    .map((game) => {
      const boxScore = computeBoxScore(game, team, { includeInactivePlayers: true });
      const playerRow = boxScore.players.find((row) => row.playerId === String(player._id)) || {
        playerId: String(player._id),
        displayName: player.displayName,
        ftm: 0,
        fta: 0,
        fg2m: 0,
        fg2a: 0,
        fg3m: 0,
        fg3a: 0,
        ast: 0,
        oreb: 0,
        dreb: 0,
        reb: 0,
        points: 0,
      };

      const opponentName = game.opponent ?? null;

      return {
        gameId: String(game._id),
        opponent: opponentName,
        title: game.title,
        date: game.scheduledAt || game.completedAt || game.createdAt || null,
        scheduledAt: game.scheduledAt ?? null,
        completedAt: game.completedAt ?? null,
        createdAt: game.createdAt ?? null,
        opponentDestination: buildOpponentDestination(opponentName, teamLookup),
        stats: {
          ftm: playerRow.ftm,
          fta: playerRow.fta,
          fg2m: playerRow.fg2m,
          fg2a: playerRow.fg2a,
          fg3m: playerRow.fg3m,
          fg3a: playerRow.fg3a,
          ast: playerRow.ast,
          oreb: playerRow.oreb,
          dreb: playerRow.dreb,
          stl: playerRow.stl,
          tov: playerRow.tov,
          foul: playerRow.foul,
          reb: playerRow.reb,
          points: playerRow.points,
        },
      };
    })
    .sort((gameA, gameB) => publicGameTimeValue(gameB) - publicGameTimeValue(gameA));
}

function buildPublicPlayerSummary(gameRows) {
  const totals = gameRows.reduce(
    (summary, game) => ({
      points: summary.points + game.stats.points,
      reb: summary.reb + game.stats.reb,
      ast: summary.ast + game.stats.ast,
      stl: summary.stl + game.stats.stl,
      tov: summary.tov + game.stats.tov,
      foul: summary.foul + game.stats.foul,
    }),
    { points: 0, reb: 0, ast: 0, stl: 0, tov: 0, foul: 0 }
  );
  const gamesCount = gameRows.length;

  return {
    gamesCount,
    ...totals,
    pointsPerGame: gamesCount > 0 ? totals.points / gamesCount : 0,
    reboundsPerGame: gamesCount > 0 ? totals.reb / gamesCount : 0,
    assistsPerGame: gamesCount > 0 ? totals.ast / gamesCount : 0,
    stealsPerGame: gamesCount > 0 ? totals.stl / gamesCount : 0,
    turnoversPerGame: gamesCount > 0 ? totals.tov / gamesCount : 0,
    foulsPerGame: gamesCount > 0 ? totals.foul / gamesCount : 0,
  };
}

async function createTeamForUser(userId, payload) {
  await assertTeamCreationAllowed(userId);

  const players = (payload.players || []).map((player) => ({
    displayName: player.displayName.trim(),
    jerseyNumber: player.jerseyNumber,
    position: normalizePlayerPosition(player.position),
    isActive: true,
  }));

  ensureNoDuplicatePlayers(players);

  const team = await createTeam({
    ownerUserId: userId,
    name: payload.name.trim(),
    colors: (payload.colors || []).map(normalizeHexColor).filter(Boolean),
    homeVenue: normalizeVenue(payload.homeVenue),
    players,
  });

  return sanitizeTeam(team);
}

async function listTeamsForUser(userId) {
  const teams = await listTeamsByOwner(userId);
  return teams.map(sanitizeTeam);
}

async function getTeamForUser(userId, teamId) {
  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    throw new ApiError(404, 'Team not found');
  }

  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  return sanitizeTeam(team);
}

async function getPublicTeam(teamId) {
  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    throw new ApiError(404, 'Team not found');
  }

  const team = await findTeamById(teamId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  const games = await listGamesByTeamId(teamId);
  const players = team.players
    .filter((player) => Boolean(player.isActive))
    .sort((playerA, playerB) => {
      const aHasNumber = typeof playerA.jerseyNumber === 'number';
      const bHasNumber = typeof playerB.jerseyNumber === 'number';

      if (aHasNumber && bHasNumber && playerA.jerseyNumber !== playerB.jerseyNumber) {
        return playerA.jerseyNumber - playerB.jerseyNumber;
      }
      if (aHasNumber !== bHasNumber) {
        return aHasNumber ? -1 : 1;
      }
      return playerA.displayName.localeCompare(playerB.displayName);
    })
    .map((player) => ({
      id: String(player._id),
      displayName: player.displayName,
      jerseyNumber: player.jerseyNumber ?? null,
      position: normalizePlayerPosition(player.position),
    }));

  return {
    team: {
      id: String(team._id),
      name: team.name,
      logo: sanitizeLogo(team.logo),
      colors: Array.isArray(team.colors) ? team.colors.map(normalizeHexColor).filter(Boolean) : [],
      homeVenue: sanitizeVenue(team.homeVenue),
      entitlements: getTeamEntitlements(team),
      players,
    },
    // OPT-013: materialised read (indexed find); falls back to computing from
    // the games/team already loaded above on a miss (no re-fetch needed).
    summary: await getTeamSeasonSummary(team._id, { team, games }),
    games: games.map(sanitizePublicGame),
  };
}

async function getPublicPlayer(teamId, playerId) {
  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    throw new ApiError(404, 'Team not found');
  }

  const team = await findTeamById(teamId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  const player = findPlayerById(team, playerId);
  if (!player) {
    throw new ApiError(404, 'Player not found');
  }

  const games = await listGamesByTeamId(teamId);
  const teams = await listTeams();
  const teamLookup = buildTeamLookup(teams);
  const gameRows = buildPublicPlayerGameRows(games, team, player, teamLookup);
  const highlights = buildPlayerHighlights(games, String(player._id));

  return {
    team: {
      id: String(team._id),
      name: team.name,
      logo: sanitizeLogo(team.logo),
      colors: Array.isArray(team.colors) ? team.colors.map(normalizeHexColor).filter(Boolean) : [],
      homeVenue: sanitizeVenue(team.homeVenue),
      entitlements: getTeamEntitlements(team),
    },
    player: sanitizePublicPlayer(player),
    summary: buildPublicPlayerSummary(gameRows),
    games: gameRows,
    highlights,
  };
}

async function getPublicOpponentBySlug(opponentSlug) {
  const targetSlug = slugifyOpponentName(opponentSlug);
  // OPT-004: Use optimized query with limit (larger buffer for filtering)
  const games = await listPublicCompletedGames(500);
  const relatedGames = [];

  for (const game of games) {
    if (!isGamePubliclyViewable(game)) {
      continue;
    }

    if (slugifyOpponentName(game.opponent) !== targetSlug) {
      continue;
    }

    const team = await findTeamById(game.teamId);
    if (!team) {
      continue;
    }

    relatedGames.push({
      id: String(game._id),
      title: game.title,
      opponent: game.opponent ?? null,
      scheduledAt: game.scheduledAt ?? null,
      completedAt: game.completedAt ?? null,
      createdAt: game.createdAt ?? null,
      teamPoints: computeTeamPoints(game),
      team: {
        id: String(team._id),
        name: team.name,
      },
    });
  }

  relatedGames.sort((gameA, gameB) => publicGameTimeValue(gameB) - publicGameTimeValue(gameA));

  if (relatedGames.length === 0) {
    throw new ApiError(404, 'Opponent not found');
  }

  return {
    opponent: {
      slug: opponentSlug,
      displayName:
        relatedGames[0].opponent || opponentDisplayNameFromSlug(opponentSlug) || 'Unknown Opponent',
      matchedTeam: null,
    },
    summary: {
      gamesCount: relatedGames.length,
      latestGameAt:
        relatedGames[0].scheduledAt || relatedGames[0].completedAt || relatedGames[0].createdAt,
    },
    relatedGames,
  };
}

async function listPublicExploreGames(limit = 10) {
  // OPT-004: Use optimized query (buffer for dedup: limit * 2 in case many games are from same team)
  const games = await listPublicCompletedGames(limit * 2);
  const selectedGames = [];
  const seenTeamIds = new Set();

  for (const game of games) {
    if (!isGamePubliclyViewable(game)) {
      continue;
    }

    const currentTeamId = String(game.teamId);
    if (seenTeamIds.has(currentTeamId)) {
      continue;
    }

    const team = await findTeamById(currentTeamId);
    if (!team) {
      continue;
    }

    seenTeamIds.add(currentTeamId);
    selectedGames.push({
      id: String(game._id),
      title: game.title,
      opponent: game.opponent ?? null,
      scheduledAt: game.scheduledAt ?? null,
      completedAt: game.completedAt ?? null,
      createdAt: game.createdAt ?? null,
      teamPoints: computeTeamPoints(game),
      team: {
        id: String(team._id),
        name: team.name,
      },
    });

    if (selectedGames.length >= limit) {
      break;
    }
  }

  return selectedGames;
}

async function listPublicTeams(limit = 6) {
  const teams = await listTeams();
  // OPT-004: Use optimized query (large buffer to find enough unique teams)
  const games = await listPublicCompletedGames(500);
  const publicTeamIds = new Set(
    games.filter((game) => isGamePubliclyViewable(game)).map((game) => String(game.teamId))
  );

  return teams
    .filter((team) => publicTeamIds.has(String(team._id)))
    .sort(
      (teamA, teamB) => new Date(teamB.createdAt).getTime() - new Date(teamA.createdAt).getTime()
    )
    .slice(0, limit)
    .map((team) => ({
      id: String(team._id),
      name: team.name,
      logo: sanitizeLogo(team.logo),
    }));
}

async function getEntitlementsForUser(userId, teamId) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  return {
    billing: getBillingSummary(team),
    entitlements: getTeamEntitlements(team),
  };
}

async function updateTeamForUser(userId, teamId, payload) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  if (payload.name) {
    team.name = payload.name.trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'colors')) {
    team.colors = (payload.colors || []).map(normalizeHexColor).filter(Boolean);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'homeVenue')) {
    team.homeVenue = normalizeVenue(payload.homeVenue);
  }

  if (payload.removeLogo && team.logo?.publicId) {
    const previousLogoPublicId = team.logo.publicId;
    team.logo = null;
    await saveTeam(team);
    await destroyImage(previousLogoPublicId).catch(() => null);
    return sanitizeTeam(team);
  }

  await saveTeam(team);
  return sanitizeTeam(team);
}

async function uploadLogoForTeam(userId, teamId, file) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  if (!file) {
    throw new ApiError(400, 'Logo file is required');
  }

  if (file.size > env.TEAM_LOGO_MAX_BYTES) {
    throw new ApiError(400, 'Logo exceeds upload size limit');
  }

  if (!TEAM_LOGO_MIME_TYPES.has(file.mimetype)) {
    throw new ApiError(400, 'Unsupported image type');
  }

  if (!isCloudinaryConfigured()) {
    throw new ApiError(500, 'Cloudinary is not configured');
  }

  const previousLogo = team.logo
    ? {
        publicId: team.logo.publicId || null,
      }
    : null;

  const upload = await uploadImageBuffer(file);

  try {
    team.logo = {
      url: upload.secure_url,
      publicId: upload.public_id,
      width: upload.width ?? null,
      height: upload.height ?? null,
      mimeType: file.mimetype,
    };
    await saveTeam(team);
  } catch (error) {
    await destroyImage(upload.public_id).catch(() => null);
    throw error;
  }

  if (previousLogo?.publicId && previousLogo.publicId !== upload.public_id) {
    await destroyImage(previousLogo.publicId).catch(() => null);
  }

  return sanitizeTeam(team);
}

async function removeLogoFromTeam(userId, teamId) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  const previousLogoPublicId = team.logo?.publicId || null;
  team.logo = null;
  await saveTeam(team);
  await destroyImage(previousLogoPublicId).catch(() => null);
  return sanitizeTeam(team);
}

async function addPlayerToTeam(userId, teamId, payload) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  const targetName = normalizeName(payload.displayName);
  const duplicate = team.players.some(
    (player) => Boolean(player.isActive) && normalizeName(player.displayName) === targetName
  );

  if (duplicate) {
    throw new ApiError(400, 'Player display name already exists in team');
  }

  team.players.push({
    displayName: payload.displayName.trim(),
    jerseyNumber: payload.jerseyNumber,
    position: normalizePlayerPosition(payload.position),
    isActive: true,
  });

  await saveTeam(team);
  // OPT-013: the materialised season summary embeds a (zeroed) row per roster
  // player, so roster changes must refresh it (verification fix, 2026-07-06).
  scheduleTeamSeasonSummaryRecompute(team._id);
  return sanitizeTeam(team);
}

async function updatePlayerOnTeam(userId, teamId, playerId, payload) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  const player = team.players.id(playerId);
  if (!player) {
    throw new ApiError(404, 'Player not found');
  }

  if (payload.displayName) {
    const next = normalizeName(payload.displayName);
    const duplicate = team.players.some(
      (candidate) =>
        String(candidate._id) !== String(player._id) &&
        Boolean(candidate.isActive) &&
        normalizeName(candidate.displayName) === next
    );

    if (duplicate) {
      throw new ApiError(400, 'Player display name already exists in team');
    }

    player.displayName = payload.displayName.trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'jerseyNumber')) {
    player.jerseyNumber = payload.jerseyNumber ?? undefined;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'position')) {
    player.position = normalizePlayerPosition(payload.position);
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'isActive')) {
    player.isActive = payload.isActive;
  }

  await saveTeam(team);
  // OPT-013: renames/position changes are embedded in the materialised summary.
  scheduleTeamSeasonSummaryRecompute(team._id);
  return sanitizeTeam(team);
}

async function deactivatePlayerOnTeam(userId, teamId, playerId) {
  const team = await findTeamByIdAndOwner(teamId, userId);
  if (!team) {
    throw new ApiError(404, 'Team not found');
  }

  const player = team.players.id(playerId);
  if (!player) {
    throw new ApiError(404, 'Player not found');
  }

  player.isActive = false;
  await saveTeam(team);
  // OPT-013: roster changes must refresh the materialised season summary.
  scheduleTeamSeasonSummaryRecompute(team._id);
  return sanitizeTeam(team);
}

module.exports = {
  createTeamForUser,
  listTeamsForUser,
  getTeamForUser,
  getPublicTeam,
  getPublicPlayer,
  getPublicOpponentBySlug,
  listPublicExploreGames,
  listPublicTeams,
  buildPublicTeamSummary,
  computeTeamSeasonSummary,
  getTeamSeasonSummary,
  recomputeTeamSeasonSummary,
  scheduleTeamSeasonSummaryRecompute,
  buildPublicPlayerGameRows,
  buildPublicPlayerSummary,
  slugifyOpponentName,
  updateTeamForUser,
  uploadLogoForTeam,
  removeLogoFromTeam,
  addPlayerToTeam,
  updatePlayerOnTeam,
  deactivatePlayerOnTeam,
  getEntitlementsForUser,
};
