const mongoose = require('mongoose');
const { createHash, randomUUID } = require('crypto');
const { ApiError } = require('../../utils/apiError');
const repo = require('./scrimmages.repository');
const { identityId, identityIds, identityGames } = require('./scrimmages.identity');
const {
  DEFAULT_MVP_RULES,
  aggregateScrimmageStats,
  validateGameRosters,
} = require('./scrimmages.scoring');
const { Game, createGame } = require('../games/games.repository');
const { findLeaguePlayerById } = require('../leagues/leagues.repository');
const { CURRENT_COURT_LAYOUT_ID } = require('../shared/courtLayouts');
const { createReadyClock } = require('../shared/gameClock');

function terms(text) {
  return { text, version: createHash('sha256').update(text).digest('hex') };
}
function canManage(series, userId) {
  return Boolean(
    userId &&
    (String(series.ownerUserId) === String(userId) ||
      series.managerUserIds.some((id) => String(id) === String(userId)))
  );
}
function validId(id) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, 'Scrimmage not found');
}
async function getSeries(id, userId, manage = false) {
  validId(id);
  const series = await repo.Scrimmage.findById(id);
  if (!series) throw new ApiError(404, 'Scrimmage not found');
  const manager = canManage(series, userId);
  if (manage && !manager) throw new ApiError(403, 'Scrimmage admin access required');
  if (
    !manage &&
    !series.isPublic &&
    !manager &&
    !(userId && (await repo.ScrimmagePlayer.exists({ scrimmageId: id, userId })))
  )
    throw new ApiError(404, 'Scrimmage not found');
  return series;
}
async function getSession(seriesId, sessionId, userId, manage = false) {
  const series = await getSeries(seriesId, userId, manage);
  validId(sessionId);
  const session = await repo.ScrimmageSession.findOne({ _id: sessionId, scrimmageId: seriesId });
  if (!session) throw new ApiError(404, 'Weekly session not found');
  return { series, session };
}
function serializeSeries(series, userId) {
  return {
    id: String(series._id),
    name: series.name,
    isPublic: series.isPublic,
    canManage: canManage(series, userId),
    isOwner: String(series.ownerUserId) === String(userId),
    terms: series.terms,
    termsScope: series.termsScope,
    activeSeasonId: String(series.activeSeasonId),
    seasons: series.seasons.map((s) => ({
      id: String(s._id),
      label: s.label,
      mvpRules: s.mvpRules,
      endedAt: s.endedAt,
    })),
    ...(canManage(series, userId) ? { managerUserIds: series.managerUserIds.map(String) } : {}),
  };
}
function serializeSession(session) {
  const value = session.toObject();
  delete value.gameCreationKey;
  delete value.gameCreationLeaseUntil;
  delete value.publishedByUserId;
  return {
    ...value,
    id: String(session._id),
    scrimmageId: String(session.scrimmageId),
    seasonId: String(session.seasonId),
    assignments: session.assignments.map((p) => ({
      playerId: String(p.playerId),
      displayName: p.displayName,
      color: p.color,
    })),
  };
}
function serializePlayer(p) {
  return {
    id: String(p._id),
    displayName: p.displayName,
    isActive: p.isActive,
    leaguePlayerId: p.leaguePlayerId ? String(p.leaguePlayerId) : null,
  };
}
async function list(userId, managed = false) {
  const filter = managed
    ? { $or: [{ ownerUserId: userId }, { managerUserIds: userId }] }
    : { isPublic: true };
  const records = await repo.Scrimmage.find(filter).sort({ name: 1 }).limit(200);
  return { scrimmages: records.map((s) => serializeSeries(s, userId)) };
}
async function create(userId, payload) {
  const seasonId = new mongoose.Types.ObjectId();
  const series = await repo.Scrimmage.create({
    ownerUserId: userId,
    name: payload.name,
    isPublic: payload.isPublic,
    terms: terms(payload.termsText),
    termsScope: payload.termsScope,
    activeSeasonId: seasonId,
    seasons: [
      {
        _id: seasonId,
        label: payload.seasonLabel,
        mvpRules: payload.mvpRules || DEFAULT_MVP_RULES,
      },
    ],
  });
  return { scrimmage: serializeSeries(series, userId) };
}
async function detail(id, userId, requestedSeasonId) {
  const series = await getSeries(id, userId);
  const seasonId = requestedSeasonId || String(series.activeSeasonId);
  const season = series.seasons.id(seasonId);
  if (!season) throw new ApiError(404, 'Season not found');
  const [pool, sessions, games, membership, request] = await Promise.all([
    repo.ScrimmagePlayer.find({ scrimmageId: id }).sort({ displayName: 1 }),
    repo.ScrimmageSession.find({ scrimmageId: id, seasonId }).sort({ date: -1, createdAt: -1 }),
    Game.find({ scrimmageId: id, scrimmageSeasonId: seasonId }).lean(),
    userId ? repo.ScrimmagePlayer.findOne({ scrimmageId: id, userId }) : null,
    userId ? repo.ScrimmageJoinRequest.findOne({ scrimmageId: id, userId }) : null,
  ]);
  const managerEmails = canManage(series, userId)
    ? (await require('../auth/auth.repository').findUsersByIds(series.managerUserIds)).map(
        (u) => u.email
      )
    : [];
  return {
    scrimmage: {
      ...serializeSeries(series, userId),
      ...(canManage(series, userId) ? { managerEmails } : {}),
    },
    pool: pool
      .filter((player) => identityId(series, player._id) === String(player._id))
      .map(serializePlayer),
    sessions: sessions.map((session) => {
      const weeklyGames = games.filter((g) => String(g.scrimmageSessionId) === String(session._id));
      return {
        ...serializeSession(session),
        gameCount: weeklyGames.length,
        activeGameId: weeklyGames.find((g) => g.status !== 'completed')?._id?.toString() || null,
      };
    }),
    standings: aggregateScrimmageStats(
      identityGames(
        canManage(series, userId)
          ? games
          : games.filter((g) =>
              sessions.some(
                (week) => week.publishedAt && String(week._id) === String(g.scrimmageSessionId)
              )
            ),
        series,
        pool
      ),
      season.mvpRules.toObject(),
      'season'
    ),
    membership: membership
      ? serializePlayer(
          pool.find((player) => String(player._id) === identityId(series, membership._id)) ||
            membership
        )
      : null,
    joinStatus: request?.status || null,
  };
}
async function update(id, userId, payload) {
  const series = await getSeries(id, userId, true);
  if (String(series.ownerUserId) !== String(userId))
    throw new ApiError(403, 'Only the owner can edit scrimmage settings');
  for (const field of ['name', 'isPublic', 'termsScope'])
    if (payload[field] !== undefined) series[field] = payload[field];
  if (payload.managerEmails) {
    const users = await Promise.all(
      [...new Set(payload.managerEmails)].map((email) =>
        require('../auth/auth.repository').findUserByEmail(email)
      )
    );
    if (users.some((u) => !u))
      throw new ApiError(400, 'Each admin must have an existing application account');
    series.managerUserIds = users.filter((u) => String(u._id) !== String(userId)).map((u) => u._id);
  }
  if (payload.termsText !== undefined) series.terms = terms(payload.termsText);
  await series.save();
  return { scrimmage: serializeSeries(series, userId) };
}
async function playerProfile(id, playerId, userId, filters = {}) {
  const series = await getSeries(id, userId);
  validId(playerId);
  playerId = identityId(series, playerId);
  const player = await repo.ScrimmagePlayer.findOne({ _id: playerId, scrimmageId: id });
  if (!player) throw new ApiError(404, 'Scrimmage player not found');
  const relatedIds = identityIds(series, playerId);
  const seasonId = filters.seasonId || String(series.activeSeasonId);
  const season = series.seasons.id(seasonId);
  if (!season) throw new ApiError(404, 'Season not found');
  const sessions = await repo.ScrimmageSession.find({ scrimmageId: id, seasonId }).sort({
    date: -1,
    createdAt: -1,
  });
  if (filters.sessionId && !sessions.some((s) => String(s._id) === filters.sessionId))
    throw new ApiError(404, 'Weekly session not found in this season');
  const games = await Game.find({
    scrimmageId: id,
    scrimmageSeasonId: seasonId,
    status: 'completed',
    scrimmageSessionId: {
      $in: sessions
        .filter(
          (week) =>
            (!filters.sessionId || String(week._id) === filters.sessionId) &&
            (canManage(series, userId) || week.publishedAt)
        )
        .map((week) => week._id),
    },
    $or: [
      { 'homeRosterSnapshot._id': { $in: relatedIds } },
      { 'awayRosterSnapshot._id': { $in: relatedIds } },
    ],
  })
    .sort({ completedAt: -1, createdAt: -1 })
    .lean();
  const scope = filters.sessionId ? 'weekly' : 'season';
  const rows = aggregateScrimmageStats(
    identityGames(games, series, [player]),
    season.mvpRules.toObject(),
    scope
  );
  const sessionsById = new Map(sessions.map((s) => [String(s._id), s]));
  const plays = games.flatMap((g) =>
    (g.events || [])
      .filter(
        (e) =>
          relatedIds.includes(String(e.playerId)) &&
          ['FG2_MADE', 'FG2_MISS', 'FG3_MADE', 'FG3_MISS', 'TOV'].includes(e.statType)
      )
      .map((e) => {
        const week = sessionsById.get(String(g.scrimmageSessionId));
        return {
          eventId: String(e._id || e.id),
          gameId: String(g._id),
          gameTitle: g.title,
          sessionId: String(g.scrimmageSessionId),
          sessionLabel: week?.label || 'Weekly session',
          date: week?.date || null,
          statType: e.statType,
          teamSide: e.teamSide,
          videoTimestamp: e.videoTimestamp ?? null,
          videoUrl: g.videoUrl || week?.videoUrl || null,
          scoringRules: g.scoringRules || null,
        };
      })
  );
  return {
    scrimmage: serializeSeries(series, userId),
    player: serializePlayer(player),
    seasonId,
    sessionId: filters.sessionId || null,
    scope,
    sessions: sessions.map((s) => ({ id: String(s._id), label: s.label, date: s.date })),
    stats: rows.find((r) => r.playerId === playerId) || null,
    games: games.map((g) => ({
      id: String(g._id),
      title: g.title,
      sessionId: String(g.scrimmageSessionId),
      date: sessionsById.get(String(g.scrimmageSessionId))?.date || null,
    })),
    plays,
  };
}
async function addPlayer(id, userId, payload) {
  await getSeries(id, userId, true);
  let displayName = payload.displayName;
  if (payload.leaguePlayerId) {
    const source = await findLeaguePlayerById(payload.leaguePlayerId);
    if (!source) throw new ApiError(404, 'League player not found');
    await require('../leagues/leagues.service').assertLeagueManagerOrOwner(userId, source.leagueId);
    displayName = source.displayName;
  }
  if (payload.sourcePlayerId) {
    const team = await require('../teams/teams.repository').findTeamByIdAndOwner(
      payload.sourceTeamId,
      userId
    );
    const source = team?.players.id(payload.sourcePlayerId);
    if (!source) throw new ApiError(404, 'Managed team player not found');
    displayName = source.displayName;
  }
  const player = await repo.ScrimmagePlayer.create({
    scrimmageId: id,
    displayName,
    leaguePlayerId: payload.leaguePlayerId || null,
    sourceTeamId: payload.sourceTeamId || null,
    sourcePlayerId: payload.sourcePlayerId || null,
  });
  return { player: serializePlayer(player) };
}
async function importOptions(id, userId) {
  const series = await getSeries(id, userId, true);
  const { League, LeagueManager, LeaguePlayer } = require('../leagues/leagues.repository');
  const { Team } = require('../teams/teams.repository');
  const managers = await LeagueManager.find({ userId, status: 'active' }).select('leagueId');
  const [leagues, teams] = await Promise.all([
    League.find({
      $or: [{ ownerUserId: userId }, { _id: { $in: managers.map((m) => m.leagueId) } }],
    }).select('name'),
    Team.find({ ownerUserId: userId }),
  ]);
  const sourceNames = new Map(leagues.map((l) => [String(l._id), l.name]));
  const players = await LeaguePlayer.find({
    leagueId: { $in: leagues.map((l) => l._id) },
    isActive: true,
  }).select('displayName leagueId');
  const pool = await repo.ScrimmagePlayer.find({ scrimmageId: id });
  const options = [
    ...players.map((p) => ({
      key: `league:${p._id}`,
      displayName: p.displayName,
      sourceName: sourceNames.get(String(p.leagueId)),
      leaguePlayerId: String(p._id),
      sourceKey: `league:${p.leagueId}`,
      sourceType: 'league',
    })),
    ...teams.flatMap((t) =>
      t.players
        .filter((p) => p.isActive)
        .map((p) => ({
          key: `team:${p._id}`,
          displayName: p.displayName,
          sourceName: t.name,
          sourceTeamId: String(t._id),
          sourceKey: `team:${t._id}`,
          sourceType: 'team',
          sourcePlayerId: String(p._id),
        }))
    ),
  ];
  return {
    players: options
      .map((option) => {
        const existing = pool.find((player) =>
          option.leaguePlayerId
            ? String(player.leaguePlayerId) === option.leaguePlayerId
            : String(player.sourcePlayerId) === option.sourcePlayerId &&
              String(player.sourceTeamId) === option.sourceTeamId
        );
        return {
          ...option,
          alreadyInPool: Boolean(existing),
          poolPlayerId: existing ? identityId(series, existing._id) : null,
        };
      })
      .sort(
        (a, b) =>
          a.displayName.localeCompare(b.displayName) || a.sourceName.localeCompare(b.sourceName)
      ),
  };
}
async function sourceClaimedUser(player) {
  if (player.leaguePlayerId)
    return (await findLeaguePlayerById(player.leaguePlayerId))?.claimedByUserId || null;
  if (player.sourceTeamId) {
    const team = await require('../teams/teams.repository').findTeamById(player.sourceTeamId);
    return team?.players.id(player.sourcePlayerId)?.claimedByUserId || null;
  }
  return null;
}
async function assertIdentityClaim(series, playerId, userId) {
  const players = await repo.ScrimmagePlayer.find({
    scrimmageId: series._id,
    _id: { $in: identityIds(series, playerId) },
  });
  let member = null;
  for (const player of players) {
    if (player.userId) {
      if (String(player.userId) !== String(userId))
        throw new ApiError(409, 'This merged profile is linked to another account');
      member = player;
    }
    const sourceUser = await sourceClaimedUser(player);
    if (sourceUser && String(sourceUser) !== String(userId))
      throw new ApiError(403, 'A source profile belongs to another account');
  }
  return member;
}
async function mergePlayers(id, fromPlayerId, userId, payload) {
  validId(fromPlayerId);
  validId(payload.toPlayerId);
  return withSeriesSetupLease(id, userId, async (series) => {
    const toPlayerId = payload.toPlayerId;
    if (fromPlayerId === toPlayerId) throw new ApiError(400, 'Choose two different profiles');
    if (
      identityId(series, fromPlayerId) !== fromPlayerId ||
      identityId(series, toPlayerId) !== toPlayerId
    )
      throw new ApiError(409, 'Choose retained profiles, not previously merged duplicates');
    const groupIds = [...identityIds(series, fromPlayerId), ...identityIds(series, toPlayerId)];
    const players = await repo.ScrimmagePlayer.find({ scrimmageId: id, _id: { $in: groupIds } });
    if (
      !players.some((player) => String(player._id) === fromPlayerId) ||
      !players.some((player) => String(player._id) === toPlayerId)
    )
      throw new ApiError(404, 'Scrimmage player not found');
    const users = new Set();
    for (const player of players) {
      if (player.userId) users.add(String(player.userId));
      const sourceUser = await sourceClaimedUser(player);
      if (sourceUser) users.add(String(sourceUser));
    }
    if (users.size > 1)
      throw new ApiError(409, 'These profiles belong to different accounts and cannot be merged');
    if (
      await repo.ScrimmageSession.exists({
        scrimmageId: id,
        status: 'open',
        'assignments.playerId': { $in: groupIds },
      })
    )
      throw new ApiError(409, 'Finish weekly sessions containing these profiles before merging');
    const games = await Game.find({
      scrimmageId: id,
      $or: [
        { 'homeRosterSnapshot._id': { $in: groupIds } },
        { 'awayRosterSnapshot._id': { $in: groupIds } },
      ],
    }).lean();
    const sourceIds = new Set(identityIds(series, fromPlayerId));
    const targetIds = new Set(identityIds(series, toPlayerId));
    if (
      games.some((game) => {
        const roster = [...(game.homeRosterSnapshot || []), ...(game.awayRosterSnapshot || [])].map(
          (player) => String(player._id || player.id)
        );
        return (
          roster.some((player) => sourceIds.has(player)) &&
          roster.some((player) => targetIds.has(player))
        );
      })
    )
      throw new ApiError(
        409,
        'Both profiles appear in the same game. Review their identities; they cannot be merged automatically'
      );
    const now = new Date();
    series.playerMerges = (series.playerMerges || []).map((merge) => ({
      fromPlayerId: merge.fromPlayerId,
      toPlayerId: String(merge.toPlayerId) === fromPlayerId ? toPlayerId : merge.toPlayerId,
      mergedAt: merge.mergedAt,
      mergedByUserId: merge.mergedByUserId,
    }));
    series.playerMerges.push({ fromPlayerId, toPlayerId, mergedAt: now, mergedByUserId: userId });
    await series.save();
    return {
      player: serializePlayer(players.find((player) => String(player._id) === toPlayerId)),
      mergedPlayerId: fromPlayerId,
    };
  });
}
async function updatePlayer(id, playerId, userId, payload) {
  const series = await getSeries(id, userId, true);
  if (identityId(series, playerId) !== playerId)
    throw new ApiError(409, 'Edit the retained profile instead of a merged duplicate');
  validId(playerId);
  const player = await repo.ScrimmagePlayer.findOne({ _id: playerId, scrimmageId: id });
  if (!player) throw new ApiError(404, 'Player not found');
  Object.assign(player, payload);
  await player.save();
  return { player: serializePlayer(player) };
}
async function resolveAssignments(id, assignments) {
  const series = await repo.Scrimmage.findById(id);
  if (assignments.some((entry) => identityId(series, entry.playerId) !== entry.playerId))
    throw new ApiError(409, 'Select the retained profile instead of a merged duplicate');
  const ids = assignments.map((p) => p.playerId);
  if (new Set(ids).size !== ids.length)
    throw new ApiError(400, 'A player may have only one weekly color');
  const players = await repo.ScrimmagePlayer.find({
    scrimmageId: id,
    _id: { $in: ids },
    isActive: true,
  });
  if (players.length !== ids.length)
    throw new ApiError(400, 'Select active players from this scrimmage pool');
  const byId = new Map(players.map((p) => [String(p._id), p]));
  return assignments.map((p) => ({ ...p, displayName: byId.get(p.playerId).displayName }));
}
async function createSession(id, userId, payload) {
  return withSeriesSetupLease(id, userId, async (series) => {
    const session = await repo.ScrimmageSession.create({
      ...payload,
      assignments: await resolveAssignments(id, payload.assignments),
      scrimmageId: id,
      seasonId: series.activeSeasonId,
      terms: payload.termsText ? terms(payload.termsText) : series.terms.toObject(),
      termsScope: payload.termsText ? 'weekly' : series.termsScope,
    });
    return { session: serializeSession(session) };
  });
}
async function withSeriesSetupLease(id, userId, action) {
  await getSeries(id, userId, true);
  const key = randomUUID();
  const series = await repo.Scrimmage.findOneAndUpdate(
    { _id: id, $or: [{ setupLeaseKey: null }, { setupLeaseUntil: { $lt: new Date() } }] },
    {
      $set: { setupLeaseKey: key, setupLeaseUntil: new Date(Date.now() + 60000) },
      $inc: { __v: 1 },
    },
    { new: true }
  );
  if (!series)
    throw new ApiError(409, 'Another admin is updating this scrimmage. Try again shortly');
  try {
    return await action(series);
  } finally {
    await repo.Scrimmage.updateOne(
      { _id: id, setupLeaseKey: key },
      { $set: { setupLeaseKey: null, setupLeaseUntil: null } }
    );
  }
}
async function sessionDetail(id, sessionId, userId) {
  const { series, session } = await getSession(id, sessionId, userId);
  const games = await Game.find({ scrimmageSessionId: sessionId }).sort({ createdAt: 1 });
  const pool = series.playerMerges?.length
    ? await repo.ScrimmagePlayer.find({ scrimmageId: id })
    : [];
  const rules = series.seasons.id(session.seasonId).mvpRules.toObject();
  const acceptance = userId
    ? await repo.ScrimmageAcceptance.exists({
        scrimmageId: id,
        sessionId: session.termsScope === 'weekly' ? sessionId : null,
        userId,
        termsVersion: session.terms.version,
      })
    : null;
  return {
    scrimmage: serializeSeries(series, userId),
    session: serializeSession(session),
    hasAcceptedTerms: Boolean(acceptance),
    games: games.map((g) => ({
      id: String(g._id),
      title: g.title,
      status: g.status,
      videoStartTimestamp: g.videoStartTimestamp,
      ...(canManage(series, userId)
        ? {
            statCount: (g.events || []).filter((e) =>
              ['FG2_MADE', 'FG2_MISS', 'FG3_MADE', 'FG3_MISS', 'TOV'].includes(e.statType)
            ).length,
            missingTimestamps: (g.events || []).filter(
              (e) =>
                ['FG2_MADE', 'FG2_MISS', 'FG3_MADE', 'FG3_MISS', 'TOV'].includes(e.statType) &&
                e.videoTimestamp == null
            ).length,
          }
        : {}),
      finalScore: require('../games/games.service').computeGameFinalScore(g),
    })),
    standings: aggregateScrimmageStats(
      identityGames(canManage(series, userId) || session.publishedAt ? games : [], series, pool),
      rules
    ),
  };
}
async function editAssignments(id, sessionId, userId, assignments) {
  const { session } = await getSession(id, sessionId, userId, true);
  if (session.status !== 'open' || (await Game.exists({ scrimmageSessionId: sessionId })))
    throw new ApiError(409, 'Weekly colors are locked once a game is created');
  session.assignments = await resolveAssignments(id, assignments);
  await session.save();
  return { session: serializeSession(session) };
}
async function finishSession(id, sessionId, userId, publish = false) {
  await getSession(id, sessionId, userId, true);
  const lock = randomUUID();
  const acquired = await repo.ScrimmageSession.findOneAndUpdate(
    {
      _id: sessionId,
      $or: [{ gameCreationKey: null }, { gameCreationLeaseUntil: { $lt: new Date() } }],
    },
    {
      $set: { gameCreationKey: lock, gameCreationLeaseUntil: new Date(Date.now() + 60000) },
      $inc: { __v: 1 },
    },
    { new: true }
  );
  if (!acquired) throw new ApiError(409, 'A game is being created. Try again shortly');
  try {
    if (publish && acquired.status !== 'completed')
      throw new ApiError(409, 'Finish the weekly session before publishing results');
    if (publish && !(await Game.exists({ scrimmageSessionId: sessionId })))
      throw new ApiError(409, 'Record a game before publishing results');
    if (await Game.exists({ scrimmageSessionId: sessionId, status: { $ne: 'completed' } }))
      throw new ApiError(409, 'Finish the current game before finishing the weekly session');
    await repo.ScrimmageSession.updateOne(
      { _id: sessionId, gameCreationKey: lock },
      {
        $set: {
          status: 'completed',
          ...(publish
            ? {
                publishedAt: acquired.publishedAt || new Date(),
                publishedByUserId: acquired.publishedByUserId || userId,
              }
            : {}),
        },
      }
    );
  } finally {
    await repo.ScrimmageSession.updateOne(
      { _id: sessionId, gameCreationKey: lock },
      { $set: { gameCreationKey: null, gameCreationLeaseUntil: null } }
    );
  }
  return sessionDetail(id, sessionId, userId);
}
async function resetSeason(id, userId, payload) {
  return withSeriesSetupLease(id, userId, async (series) => {
    if (String(series.ownerUserId) !== String(userId))
      throw new ApiError(403, 'Only the owner can start a season');
    if (
      await repo.ScrimmageSession.exists({
        scrimmageId: id,
        seasonId: series.activeSeasonId,
        status: 'open',
      })
    )
      throw new ApiError(409, 'Finish open weekly sessions before starting a new season');
    const previous = series.seasons.id(series.activeSeasonId);
    previous.endedAt = new Date();
    const next = {
      _id: new mongoose.Types.ObjectId(),
      label: payload.label,
      mvpRules: payload.mvpRules || previous.mvpRules.toObject(),
    };
    series.seasons.push(next);
    series.activeSeasonId = next._id;
    await series.save();
    return { scrimmage: serializeSeries(series, userId) };
  });
}
async function acceptTerms(series, userId, payload, session = null) {
  if (payload.accepted !== true || !payload.signedName?.trim())
    throw new ApiError(400, 'Explicit acceptance and a signature are required');
  const applicable = session?.terms || series.terms;
  if (payload.termsVersion !== applicable.version)
    throw new ApiError(409, 'Terms have changed. Read and accept the current version');
  const scopeId = session?.termsScope === 'weekly' ? session._id : null;
  const filter = {
    scrimmageId: series._id,
    sessionId: scopeId,
    userId,
    termsVersion: applicable.version,
  };
  return repo.ScrimmageAcceptance.findOneAndUpdate(
    filter,
    {
      $setOnInsert: {
        ...filter,
        termsText: applicable.text,
        signedName: payload.signedName,
        acceptedAt: new Date(),
      },
    },
    { upsert: true, new: true, runValidators: true }
  );
}
async function join(id, userId, payload) {
  const series = await getSeries(id, userId);
  if (!payload.playerId) throw new ApiError(400, 'Choose an existing scrimmage profile to claim');
  let player = null;
  if (payload.playerId) {
    player = await repo.ScrimmagePlayer.findOne({
      _id: identityId(series, payload.playerId),
      scrimmageId: id,
      isActive: true,
    });
    if (!player || (player.userId && String(player.userId) !== String(userId)))
      throw new ApiError(409, 'That player profile is unavailable');
    if (player.leaguePlayerId) {
      const source = await findLeaguePlayerById(player.leaguePlayerId);
      if (source?.claimedByUserId && String(source.claimedByUserId) !== String(userId))
        throw new ApiError(403, 'This league player belongs to another account');
    }
    if (player.sourceTeamId) {
      const team = await require('../teams/teams.repository').findTeamById(player.sourceTeamId);
      const source = team?.players.id(player.sourcePlayerId);
      if (source?.claimedByUserId && String(source.claimedByUserId) !== String(userId))
        throw new ApiError(403, 'This team player belongs to another account');
    }
  }
  if (series.playerMerges?.length) await assertIdentityClaim(series, payload.playerId, userId);
  const acceptance = await acceptTerms(series, userId, payload);
  const member = await repo.ScrimmagePlayer.findOne({ scrimmageId: id, userId });
  if (member) return { status: 'approved' };
  const filter = { scrimmageId: id, userId };
  const request = await repo.ScrimmageJoinRequest.findOneAndUpdate(
    filter,
    {
      $set: {
        displayName: player?.displayName || payload.displayName,
        playerId: player?._id || null,
        status: 'pending',
        acceptanceId: acceptance._id,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );
  return { status: request.status };
}
async function acceptSession(id, sessionId, userId, payload) {
  const { series, session } = await getSession(id, sessionId, userId);
  const member = await repo.ScrimmagePlayer.findOne({ scrimmageId: id, userId });
  const active =
    member &&
    (series.playerMerges?.length
      ? await repo.ScrimmagePlayer.exists({
          scrimmageId: id,
          _id: identityId(series, member._id),
          isActive: true,
        })
      : member.isActive);
  if (!active)
    throw new ApiError(403, 'Join an active scrimmage profile before signing weekly terms');
  await acceptTerms(series, userId, payload, session);
  return { accepted: true };
}
async function requests(id, userId) {
  await getSeries(id, userId, true);
  const records = await repo.ScrimmageJoinRequest.find({ scrimmageId: id, status: 'pending' }).sort(
    { createdAt: 1 }
  );
  const [users, acceptances] = await Promise.all([
    require('../auth/auth.repository').findUsersByIds(records.map((r) => r.userId)),
    repo.ScrimmageAcceptance.find({ _id: { $in: records.map((r) => r.acceptanceId) } }),
  ]);
  const byUser = new Map(users.map((u) => [String(u._id), u]));
  const byAcceptance = new Map(acceptances.map((a) => [String(a._id), a]));
  return {
    requests: records.map((r) => ({
      id: String(r._id),
      displayName: r.displayName,
      playerId: r.playerId ? String(r.playerId) : null,
      requesterName: byUser.get(String(r.userId))?.name || 'Unknown account',
      requesterEmail: byUser.get(String(r.userId))?.email || null,
      signature: byAcceptance.get(String(r.acceptanceId))
        ? {
            signedName: byAcceptance.get(String(r.acceptanceId)).signedName,
            acceptedAt: byAcceptance.get(String(r.acceptanceId)).acceptedAt,
            termsVersion: byAcceptance.get(String(r.acceptanceId)).termsVersion,
            termsText: byAcceptance.get(String(r.acceptanceId)).termsText,
          }
        : null,
    })),
  };
}
async function review(id, requestId, userId, payload) {
  const series = await getSeries(id, userId, true);
  validId(requestId);
  const request = await repo.ScrimmageJoinRequest.findOne({ _id: requestId, scrimmageId: id });
  if (!request || request.status !== 'pending')
    throw new ApiError(409, 'Join request is no longer pending');
  if (payload.status === 'approved') {
    const acceptance = await repo.ScrimmageAcceptance.findById(request.acceptanceId);
    if (!acceptance || acceptance.termsVersion !== series.terms.version)
      throw new ApiError(409, 'The player must sign the current terms before approval');
    if (request.playerId) {
      const player = await repo.ScrimmagePlayer.findOne({
        _id: identityId(series, request.playerId),
        scrimmageId: id,
      });
      if (!player || (player.userId && String(player.userId) !== String(request.userId)))
        throw new ApiError(409, 'Player profile is already linked');
      if (player.leaguePlayerId) {
        const source = await findLeaguePlayerById(player.leaguePlayerId);
        if (source?.claimedByUserId && String(source.claimedByUserId) !== String(request.userId))
          throw new ApiError(403, 'This league player belongs to another account');
      }
      if (player.sourceTeamId) {
        const team = await require('../teams/teams.repository').findTeamById(player.sourceTeamId);
        const source = team?.players.id(player.sourcePlayerId);
        if (source?.claimedByUserId && String(source.claimedByUserId) !== String(request.userId))
          throw new ApiError(403, 'This team player belongs to another account');
      }
      const existingMember = series.playerMerges?.length
        ? await assertIdentityClaim(series, player._id, request.userId)
        : null;
      if (!existingMember) {
        player.userId = request.userId;
        await player.save();
      }
    } else
      await repo.ScrimmagePlayer.findOneAndUpdate(
        { scrimmageId: id, userId: request.userId },
        { $setOnInsert: { displayName: request.displayName, isActive: true } },
        { upsert: true, runValidators: true }
      );
  }
  request.status = payload.status;
  await request.save();
  return { status: request.status };
}
async function profiles(userId) {
  const players = await repo.ScrimmagePlayer.find({ userId });
  const records = await Promise.all(
    players.map(async (p) => {
      const data = await detail(String(p.scrimmageId), userId);
      return {
        id: data.membership.id,
        displayName: data.membership.displayName,
        scrimmage: data.scrimmage,
        stats: data.standings.find((s) => s.playerId === data.membership.id) || null,
      };
    })
  );
  return { profiles: records };
}
async function assertGameManager(userId, game) {
  return getSeries(game.scrimmageId, userId, true);
}
async function assertGameViewer(userId, game) {
  return getSeries(game.scrimmageId, userId);
}
async function newGame(id, sessionId, userId, payload) {
  let { series, session } = await getSession(id, sessionId, userId, true);
  const existing = await Game.findOne({
    scrimmageSessionId: sessionId,
    scrimmageRequestId: payload.requestId,
  });
  if (existing) return { game: { id: String(existing._id) } };
  if (session.status !== 'open') throw new ApiError(409, 'This weekly session is completed');
  if (
    [...payload.homePlayers, ...payload.awayPlayers].some(
      (player) => identityId(series, player.playerId) !== player.playerId
    )
  )
    throw new ApiError(409, 'Select retained player profiles instead of merged duplicates');
  const error = validateGameRosters(session.assignments, payload);
  if (error) throw new ApiError(400, error);
  const lock = randomUUID();
  const acquired = await repo.ScrimmageSession.findOneAndUpdate(
    {
      _id: sessionId,
      status: 'open',
      $or: [{ gameCreationKey: null }, { gameCreationLeaseUntil: { $lt: new Date() } }],
    },
    {
      $set: { gameCreationKey: lock, gameCreationLeaseUntil: new Date(Date.now() + 60000) },
      $inc: { __v: 1 },
    },
    { new: true }
  );
  if (!acquired) throw new ApiError(409, 'Another tracker is creating a game. Try again shortly');
  try {
    session = acquired;
    const rosterError = validateGameRosters(session.assignments, payload);
    if (rosterError) throw new ApiError(400, rosterError);
    const repeated = await Game.findOne({
      scrimmageSessionId: sessionId,
      scrimmageRequestId: payload.requestId,
    });
    if (repeated) return { game: { id: String(repeated._id) } };
    const current = await Game.findOne({
      scrimmageSessionId: sessionId,
      status: { $ne: 'completed' },
    });
    if (current && String(current._id) !== payload.previousGameId)
      throw new ApiError(409, 'Resume or finish the existing game first');
    const selectedIds = [...payload.homePlayers, ...payload.awayPlayers].map(
      (player) => player.playerId
    );
    const pool = await repo.ScrimmagePlayer.find({
      scrimmageId: id,
      _id: { $in: [...new Set(selectedIds.flatMap((playerId) => identityIds(series, playerId)))] },
    });
    const poolById = new Map(pool.map((p) => [String(p._id), p]));
    if (selectedIds.some((playerId) => !poolById.has(playerId)))
      throw new ApiError(400, 'A selected player is unavailable');
    if (current)
      await require('../games/games.service').finishGameForUser(userId, String(current._id));
    const snapshot = (side) =>
      payload[`${side}Players`].map((entry) => {
        const player = poolById.get(entry.playerId);
        const claimedUserId =
          pool.find((record) => identityId(series, record._id) === entry.playerId && record.userId)
            ?.userId || null;
        return {
          _id: player._id,
          sourceType: 'scrimmage_player',
          sourcePlayerId: player._id,
          leaguePlayerId: player.leaguePlayerId,
          claimedByUserId: claimedUserId,
          isClaimed: Boolean(claimedUserId),
          displayName: player.displayName,
          jerseyNumber: entry.jerseyNumber,
          isActive: true,
        };
      });
    const gameFormat = {
      regulationSegmentType: 'scrimmage',
      regulationSegmentDurationSeconds: session.regulationSeconds,
      overtimeDurationSeconds: session.overtimeSeconds,
    };
    const count = await Game.countDocuments({ scrimmageSessionId: sessionId });
    const game = await createGame({
      ownerUserId: series.ownerUserId,
      gameContext: 'scrimmage',
      scrimmageActive: true,
      trackingMode: 'dual_team',
      scrimmageId: id,
      scrimmageSessionId: sessionId,
      scrimmageSeasonId: session.seasonId,
      scrimmageRequestId: payload.requestId,
      title: `${session.label} · Game ${count + 1}`,
      status: 'scheduled',
      courtLayoutId: CURRENT_COURT_LAYOUT_ID,
      homeParticipant: {
        side: 'home',
        participantType: 'scrimmage_color',
        displayName: `Team ${payload.homeColor}`,
        colors: [payload.homeColor],
      },
      awayParticipant: {
        side: 'away',
        participantType: 'scrimmage_color',
        displayName: `Team ${payload.awayColor}`,
        colors: [payload.awayColor],
      },
      homeRosterSnapshot: snapshot('home'),
      awayRosterSnapshot: snapshot('away'),
      homeStartingLineupPlayerIds: payload.homePlayers.map((p) => p.playerId),
      homeCurrentLineupPlayerIds: payload.homePlayers.map((p) => p.playerId),
      awayStartingLineupPlayerIds: payload.awayPlayers.map((p) => p.playerId),
      awayCurrentLineupPlayerIds: payload.awayPlayers.map((p) => p.playerId),
      gameFormat,
      clock: createReadyClock(gameFormat),
      scoringRules: session.scoringRules.toObject(),
      videoUrl: session.videoUrl,
      videoStartTimestamp: payload.videoStartTimestamp,
    });
    return { game: { id: String(game._id) } };
  } finally {
    await repo.ScrimmageSession.updateOne(
      { _id: sessionId, gameCreationKey: lock },
      { $set: { gameCreationKey: null, gameCreationLeaseUntil: null } }
    );
  }
}
module.exports = {
  list,
  create,
  detail,
  update,
  addPlayer,
  importOptions,
  updatePlayer,
  mergePlayers,
  createSession,
  sessionDetail,
  editAssignments: (id, sessionId, userId, assignments) =>
    withSeriesSetupLease(id, userId, () => editAssignments(id, sessionId, userId, assignments)),
  finishSession,
  publishSession: (id, sessionId, userId) => finishSession(id, sessionId, userId, true),
  resetSeason,
  join,
  acceptSession,
  requests,
  review: (id, requestId, userId, payload) =>
    withSeriesSetupLease(id, userId, () => review(id, requestId, userId, payload)),
  profiles,
  playerProfile,
  newGame: (id, sessionId, userId, payload) =>
    withSeriesSetupLease(id, userId, () => newGame(id, sessionId, userId, payload)),
  getSeries,
  canManage,
  assertGameManager,
  assertGameViewer,
};
