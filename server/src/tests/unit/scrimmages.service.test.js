jest.mock('../../modules/scrimmages/scrimmages.repository', () => ({
  Scrimmage: { findById: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn() },
  ScrimmagePlayer: { exists: jest.fn(), findOne: jest.fn(), find: jest.fn(), create: jest.fn() },
  ScrimmageSession: {
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    exists: jest.fn(),
  },
  ScrimmageAcceptance: { findOneAndUpdate: jest.fn(), findById: jest.fn() },
  ScrimmageJoinRequest: { findOne: jest.fn(), findOneAndUpdate: jest.fn() },
}));
jest.mock('../../modules/games/games.repository', () => ({
  Game: { exists: jest.fn(), findOne: jest.fn(), countDocuments: jest.fn(), find: jest.fn() },
  createGame: jest.fn(),
}));
const repo = require('../../modules/scrimmages/scrimmages.repository');
jest.mock('../../modules/leagues/leagues.repository', () => ({
  findLeaguePlayerById: jest.fn(),
  League: { find: jest.fn() },
  LeagueManager: { find: jest.fn() },
  LeaguePlayer: { find: jest.fn() },
}));
jest.mock('../../modules/leagues/leagues.service', () => ({
  assertLeagueManagerOrOwner: jest.fn(),
}));
const { findLeaguePlayerById } = require('../../modules/leagues/leagues.repository');
const { assertLeagueManagerOrOwner } = require('../../modules/leagues/leagues.service');
const { Game, createGame } = require('../../modules/games/games.repository');
const service = require('../../modules/scrimmages/scrimmages.service');
const seriesId = 'a'.repeat(24),
  sessionId = 'b'.repeat(24),
  owner = 'c'.repeat(24);
const series = {
  _id: seriesId,
  ownerUserId: owner,
  managerUserIds: [],
  isPublic: false,
  terms: { text: 'Terms', version: 'v' },
};
beforeEach(() => {
  jest.resetAllMocks();
  repo.Scrimmage.findById.mockResolvedValue(series);
  repo.Scrimmage.findOneAndUpdate.mockImplementation(({ _id }) => repo.Scrimmage.findById(_id));
  repo.ScrimmageSession.findOne.mockResolvedValue({
    _id: sessionId,
    scrimmageId: seriesId,
    status: 'open',
    assignments: [],
  });
});
test('private scrimmages are hidden from anonymous viewers and non-members', async () => {
  await expect(service.getSeries(seriesId, null)).rejects.toMatchObject({ statusCode: 404 });
  await expect(service.getSeries(seriesId, 'stranger')).rejects.toMatchObject({ statusCode: 404 });
  repo.ScrimmagePlayer.exists.mockResolvedValue(true);
  await expect(service.getSeries(seriesId, 'member')).resolves.toBe(series);
});
test('members cannot manage tracking and admins can', async () => {
  await expect(
    service.assertGameManager('member', { scrimmageId: seriesId })
  ).rejects.toMatchObject({ statusCode: 403 });
  await expect(service.assertGameManager(owner, { scrimmageId: seriesId })).resolves.toBe(series);
});
test('unsigned or stale terms never produce a claim request', async () => {
  repo.Scrimmage.findById.mockResolvedValue({ ...series, isPublic: true });
  repo.ScrimmagePlayer.findOne.mockResolvedValue({ _id: sessionId });
  await expect(
    service.join(seriesId, 'member', {
      playerId: sessionId,
      termsVersion: 'old',
      signedName: 'John',
      accepted: true,
    })
  ).rejects.toMatchObject({ statusCode: 409 });
  expect(repo.ScrimmageAcceptance.findOneAndUpdate).not.toHaveBeenCalled();
  expect(repo.ScrimmageJoinRequest.findOneAndUpdate).not.toHaveBeenCalled();
});
test('approval requires the signed current version', async () => {
  repo.ScrimmageJoinRequest.findOne.mockResolvedValue({
    status: 'pending',
    acceptanceId: sessionId,
  });
  repo.ScrimmageAcceptance.findById.mockResolvedValue({ termsVersion: 'old' });
  await expect(
    service.review(seriesId, sessionId, owner, { status: 'approved' })
  ).rejects.toMatchObject({ statusCode: 409 });
});
test('a retried game creation returns the same game without a second create or finish', async () => {
  Game.findOne.mockResolvedValue({ _id: 'd'.repeat(24) });
  await expect(
    service.newGame(seriesId, sessionId, owner, { requestId: 'retry' })
  ).resolves.toEqual({ game: { id: 'd'.repeat(24) } });
  expect(createGame).not.toHaveBeenCalled();
});
function weeklySetup() {
  const assignments = Array.from({ length: 10 }, (_, i) => ({
    playerId: `p${i}`,
    displayName: `Player ${i}`,
    color: i < 5 ? 'red' : 'white',
  }));
  const weekly = {
    _id: sessionId,
    scrimmageId: seriesId,
    seasonId: 'season',
    status: 'open',
    assignments,
    label: 'Week 1',
    videoUrl: 'https://youtu.be/example',
    regulationSeconds: 240,
    overtimeSeconds: 240,
    scoringRules: { toObject: () => ({ insideArc: 1, outsideArc: 2 }) },
  };
  const payload = {
    requestId: 'new',
    homeColor: 'red',
    awayColor: 'white',
    homePlayers: assignments.slice(0, 5).map((p, i) => ({ playerId: p.playerId, jerseyNumber: i })),
    awayPlayers: assignments.slice(5).map((p, i) => ({ playerId: p.playerId, jerseyNumber: i })),
    videoStartTimestamp: 3690,
  };
  return { assignments, weekly, payload };
}
test('new games snapshot weekly scoring, durable player IDs and the full-video offset', async () => {
  const { weekly, assignments, payload } = weeklySetup();
  repo.ScrimmageSession.findOne.mockResolvedValue(weekly);
  repo.ScrimmageSession.findOneAndUpdate.mockResolvedValue(weekly);
  Game.findOne.mockResolvedValue(null);
  Game.countDocuments.mockResolvedValue(2);
  repo.ScrimmagePlayer.find.mockResolvedValue(
    assignments.map((p) => ({ _id: p.playerId, displayName: p.displayName }))
  );
  createGame.mockResolvedValue({ _id: 'next' });
  await expect(service.newGame(seriesId, sessionId, owner, payload)).resolves.toEqual({
    game: { id: 'next' },
  });
  const snapshot = createGame.mock.calls[0][0];
  expect(snapshot).toMatchObject({
    gameContext: 'scrimmage',
    title: 'Week 1 · Game 3',
    scrimmageSeasonId: 'season',
    scrimmageSessionId: sessionId,
    videoStartTimestamp: 3690,
    scoringRules: { insideArc: 1, outsideArc: 2 },
    gameFormat: {
      regulationSegmentType: 'scrimmage',
      regulationSegmentDurationSeconds: 240,
      overtimeDurationSeconds: 240,
    },
    clock: { status: 'ready', remainingMilliseconds: 240000 },
  });
  expect(snapshot.homeRosterSnapshot[0]).toMatchObject({
    _id: 'p0',
    sourcePlayerId: 'p0',
    jerseyNumber: 0,
  });
  expect(repo.ScrimmageSession.updateOne).toHaveBeenCalledWith(
    expect.objectContaining({ _id: sessionId }),
    expect.objectContaining({ $set: { gameCreationKey: null, gameCreationLeaseUntil: null } })
  );
});
test('concurrent creation cannot start a second game', async () => {
  const { weekly, payload } = weeklySetup();
  repo.ScrimmageSession.findOne.mockResolvedValue(weekly);
  repo.ScrimmageSession.findOneAndUpdate.mockResolvedValue(null);
  await expect(service.newGame(seriesId, sessionId, owner, payload)).rejects.toMatchObject({
    statusCode: 409,
  });
  expect(createGame).not.toHaveBeenCalled();
});
test('smaller rosters create a game with their selected players as starters', async () => {
  const { weekly, assignments, payload } = weeklySetup();
  payload.homePlayers = payload.homePlayers.slice(0, 3);
  payload.awayPlayers = payload.awayPlayers.slice(0, 2);
  const selected = new Set([...payload.homePlayers, ...payload.awayPlayers].map((p) => p.playerId));
  repo.ScrimmageSession.findOne.mockResolvedValue(weekly);
  repo.ScrimmageSession.findOneAndUpdate.mockResolvedValue(weekly);
  Game.findOne.mockResolvedValue(null);
  Game.countDocuments.mockResolvedValue(0);
  repo.ScrimmagePlayer.find.mockResolvedValue(
    assignments
      .filter((p) => selected.has(p.playerId))
      .map((p) => ({ _id: p.playerId, displayName: p.displayName }))
  );
  createGame.mockResolvedValue({ _id: 'small-game' });
  await expect(service.newGame(seriesId, sessionId, owner, payload)).resolves.toEqual({
    game: { id: 'small-game' },
  });
  const game = createGame.mock.calls[0][0];
  expect(game.homeRosterSnapshot).toHaveLength(3);
  expect(game.awayRosterSnapshot).toHaveLength(2);
  expect(game.homeCurrentLineupPlayerIds).toEqual(['p0', 'p1', 'p2']);
  expect(game.awayCurrentLineupPlayerIds).toEqual(['p5', 'p6']);
});
test('weekly completion holds the creation lock and refuses unfinished games', async () => {
  repo.ScrimmageSession.findOneAndUpdate.mockResolvedValue({ _id: sessionId });
  Game.exists.mockResolvedValue(true);
  await expect(service.finishSession(seriesId, sessionId, owner)).rejects.toMatchObject({
    statusCode: 409,
  });
  expect(repo.ScrimmageSession.updateOne).not.toHaveBeenCalledWith(expect.anything(), {
    $set: { status: 'completed' },
  });
  expect(repo.ScrimmageSession.updateOne).toHaveBeenCalledWith(expect.anything(), {
    $set: { gameCreationKey: null, gameCreationLeaseUntil: null },
  });
});
test('a season cannot reset while a weekly session is open, and its setup lock is released', async () => {
  repo.Scrimmage.findOneAndUpdate.mockResolvedValue(series);
  repo.ScrimmageSession.exists.mockResolvedValue(true);
  await expect(service.resetSeason(seriesId, owner, { label: 'Season 2' })).rejects.toMatchObject({
    statusCode: 409,
  });
  expect(repo.Scrimmage.updateOne).toHaveBeenCalledWith(
    expect.objectContaining({ _id: seriesId }),
    { $set: { setupLeaseKey: null, setupLeaseUntil: null } }
  );
});
test('acceptance cannot be implicit even when terms version matches', async () => {
  repo.Scrimmage.findById.mockResolvedValue({ ...series, isPublic: true });
  repo.ScrimmagePlayer.findOne.mockResolvedValue({ _id: sessionId });
  await expect(
    service.join(seriesId, 'member', {
      playerId: sessionId,
      termsVersion: 'v',
      signedName: 'John',
      accepted: false,
    })
  ).rejects.toMatchObject({ statusCode: 400 });
  expect(repo.ScrimmageAcceptance.findOneAndUpdate).not.toHaveBeenCalled();
});

test('importing a managed league player creates a distinct attached scrimmage profile', async () => {
  const sourceId = 'd'.repeat(24);
  findLeaguePlayerById.mockResolvedValue({
    _id: sourceId,
    leagueId: 'source-league',
    displayName: 'John',
  });
  repo.ScrimmagePlayer.create.mockImplementation(async (payload) => ({
    ...payload,
    _id: 'e'.repeat(24),
    isActive: true,
  }));
  const result = await service.addPlayer(seriesId, owner, {
    leaguePlayerId: sourceId,
    displayName: 'Ignored name',
  });
  expect(assertLeagueManagerOrOwner).toHaveBeenCalledWith(owner, 'source-league');
  expect(repo.ScrimmagePlayer.create).toHaveBeenCalledWith(
    expect.objectContaining({
      scrimmageId: seriesId,
      leaguePlayerId: sourceId,
      displayName: 'John',
    })
  );
  expect(result.player).toMatchObject({
    id: 'e'.repeat(24),
    leaguePlayerId: sourceId,
    displayName: 'John',
  });
});
test('a source league admin check must pass before importing its player', async () => {
  findLeaguePlayerById.mockResolvedValue({ leagueId: 'source-league', displayName: 'John' });
  assertLeagueManagerOrOwner.mockRejectedValue(new Error('Forbidden'));
  await expect(
    service.addPlayer(seriesId, owner, { leaguePlayerId: 'd'.repeat(24) })
  ).rejects.toThrow('Forbidden');
  expect(repo.ScrimmagePlayer.create).not.toHaveBeenCalled();
});
function profileSetup() {
  const playerId = 'e'.repeat(24),
    seasonId = 'f'.repeat(24);
  const seasons = [{ _id: seasonId, label: 'Season 1', mvpRules: { toObject: () => ({}) } }];
  seasons.id = (id) => seasons.find((s) => String(s._id) === String(id));
  repo.Scrimmage.findById.mockResolvedValue({
    ...series,
    isPublic: true,
    seasons,
    activeSeasonId: seasonId,
    termsScope: 'series',
  });
  repo.ScrimmagePlayer.findOne.mockResolvedValue({
    _id: playerId,
    scrimmageId: seriesId,
    displayName: 'John',
    isActive: true,
  });
  repo.ScrimmageSession.find.mockReturnValue({
    sort: jest
      .fn()
      .mockResolvedValue([
        { _id: sessionId, label: 'Week 1', date: '2026-10-07', publishedAt: new Date() },
      ]),
  });
  const game = {
    _id: 'game',
    title: 'Game 1',
    status: 'completed',
    scrimmageSessionId: sessionId,
    scoringRules: { insideArc: 1, outsideArc: 2 },
    videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
    homeRosterSnapshot: [{ _id: playerId, displayName: 'John' }],
    homeStartingLineupPlayerIds: [playerId],
    awayRosterSnapshot: [{ _id: 'other', displayName: 'Kyle' }],
    awayStartingLineupPlayerIds: ['other'],
    events: [
      { _id: 'shot', playerId, teamSide: 'home', statType: 'FG2_MADE', videoTimestamp: 3672.5 },
      { _id: 'miss', playerId, teamSide: 'home', statType: 'FG3_MISS', videoTimestamp: 3680 },
      { _id: 'tov', playerId, teamSide: 'home', statType: 'TOV', videoTimestamp: null },
      {
        _id: 'other-shot',
        playerId: 'other',
        teamSide: 'away',
        statType: 'FG3_MADE',
        videoTimestamp: 3690,
      },
    ],
  };
  Game.find.mockReturnValue({
    sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([game]) }),
  });
  return { playerId, seasonId };
}
test('player profiles scope stats and timestamped plays to the attached scrimmage identity', async () => {
  const { playerId, seasonId } = profileSetup();
  const result = await service.playerProfile(seriesId, playerId, null);
  expect(Game.find).toHaveBeenCalledWith(
    expect.objectContaining({
      scrimmageId: seriesId,
      scrimmageSeasonId: seasonId,
      status: 'completed',
      $or: [
        { 'homeRosterSnapshot._id': { $in: [playerId] } },
        { 'awayRosterSnapshot._id': { $in: [playerId] } },
      ],
    })
  );
  expect(result.stats).toMatchObject({
    points: 1,
    makes: 1,
    misses: 1,
    turnovers: 1,
    fgPercentage: 50,
    losses: 1,
  });
  expect(result.plays.map((p) => p.eventId)).toEqual(['shot', 'miss', 'tov']);
  expect(result.plays[0]).toMatchObject({
    videoTimestamp: 3672.5,
    videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
    sessionLabel: 'Week 1',
  });
  expect(result.plays[2].videoTimestamp).toBeNull();
});
test('player profile week filters reject sessions outside the selected season', async () => {
  const { playerId } = profileSetup();
  await expect(
    service.playerProfile(seriesId, playerId, null, { sessionId: 'a'.repeat(24) })
  ).rejects.toMatchObject({ statusCode: 404 });
  expect(Game.find).not.toHaveBeenCalled();
});
test('weekly profile views scope their game query and eligibility to that week', async () => {
  const { playerId } = profileSetup();
  const result = await service.playerProfile(seriesId, playerId, null, { sessionId });
  expect(Game.find).toHaveBeenCalledWith(
    expect.objectContaining({ scrimmageSessionId: { $in: [sessionId] } })
  );
  expect(result.scope).toBe('weekly');
});
test('a player from a different scrimmage does not get a profile in this series', async () => {
  const { playerId } = profileSetup();
  repo.ScrimmagePlayer.findOne.mockResolvedValue(null);
  await expect(service.playerProfile(seriesId, playerId, null)).rejects.toMatchObject({
    statusCode: 404,
  });
  expect(repo.ScrimmagePlayer.findOne).toHaveBeenCalledWith({
    _id: playerId,
    scrimmageId: seriesId,
  });
});
test('private player profiles remain hidden from anonymous visitors', async () => {
  await expect(service.playerProfile(seriesId, 'e'.repeat(24), null)).rejects.toMatchObject({
    statusCode: 404,
  });
  expect(repo.ScrimmagePlayer.findOne).not.toHaveBeenCalled();
  expect(Game.find).not.toHaveBeenCalled();
});

function sessionReadSetup(publishedAt = null) {
  const { seasonId, playerId } = profileSetup();
  const value = {
    _id: sessionId,
    scrimmageId: seriesId,
    seasonId,
    label: 'Week 1',
    assignments: [],
    status: 'completed',
    terms: { text: 'Terms', version: 'v' },
    termsScope: 'series',
    publishedAt,
  };
  const session = { ...value, toObject: () => value };
  repo.ScrimmageSession.findOne.mockResolvedValue(session);
  repo.ScrimmageSession.findOneAndUpdate.mockResolvedValue(session);
  repo.ScrimmageAcceptance.exists = jest.fn().mockResolvedValue(false);
  const game = {
    _id: 'game',
    title: 'Game 1',
    status: 'completed',
    scrimmageSessionId: sessionId,
    videoStartTimestamp: 4355,
    trackingMode: 'dual_team',
    scoringRules: { insideArc: 1, outsideArc: 2 },
    homeRosterSnapshot: [{ _id: playerId, displayName: 'John' }],
    homeStartingLineupPlayerIds: [playerId],
    awayRosterSnapshot: [],
    events: [{ _id: 'e1', playerId, teamSide: 'home', statType: 'FG2_MADE', videoTimestamp: null }],
  };
  Game.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([game]) });
  return { session, game, playerId };
}
test('draft weekly standings are hidden from players but admins can review scores and missing timestamps', async () => {
  sessionReadSetup();
  const publicData = await service.sessionDetail(seriesId, sessionId, null);
  expect(publicData.standings).toEqual([]);
  expect(publicData.games[0]).not.toHaveProperty('missingTimestamps');
  const adminData = await service.sessionDetail(seriesId, sessionId, owner);
  expect(adminData.standings[0]).toMatchObject({ points: 1 });
  expect(adminData.games[0]).toMatchObject({ statCount: 1, missingTimestamps: 1 });
});
test('published weekly standings are visible to players', async () => {
  sessionReadSetup(new Date());
  expect((await service.sessionDetail(seriesId, sessionId, null)).standings[0]).toMatchObject({
    points: 1,
  });
});
test('publishing requires a finished session and releases the creation lease on failure', async () => {
  repo.ScrimmageSession.findOneAndUpdate.mockResolvedValue({ status: 'open' });
  await expect(service.publishSession(seriesId, sessionId, owner)).rejects.toThrow(
    'Finish the weekly session'
  );
  expect(repo.ScrimmageSession.updateOne).toHaveBeenCalledWith(expect.anything(), {
    $set: { gameCreationKey: null, gameCreationLeaseUntil: null },
  });
});
test('publishing rejects an empty or unfinished week', async () => {
  repo.ScrimmageSession.findOneAndUpdate.mockResolvedValue({ status: 'completed' });
  Game.exists.mockResolvedValueOnce(false);
  await expect(service.publishSession(seriesId, sessionId, owner)).rejects.toThrow('Record a game');
  Game.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
  await expect(service.publishSession(seriesId, sessionId, owner)).rejects.toThrow(
    'Finish the current game'
  );
});
test('publication records the admin and timestamp without requiring all video timestamps', async () => {
  sessionReadSetup();
  Game.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await service.publishSession(seriesId, sessionId, owner);
  expect(repo.ScrimmageSession.updateOne).toHaveBeenCalledWith(expect.anything(), {
    $set: { status: 'completed', publishedAt: expect.any(Date), publishedByUserId: owner },
  });
});
test('draft player profiles only query published weeks for regular viewers', async () => {
  const { playerId } = profileSetup();
  repo.ScrimmageSession.find.mockReturnValue({
    sort: jest.fn().mockResolvedValue([{ _id: sessionId, publishedAt: null }]),
  });
  Game.find.mockReturnValue({
    sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
  });
  await service.playerProfile(seriesId, playerId, null);
  expect(Game.find).toHaveBeenLastCalledWith(
    expect.objectContaining({ scrimmageSessionId: { $in: [] } })
  );
  await service.playerProfile(seriesId, playerId, owner);
  expect(Game.find).toHaveBeenLastCalledWith(
    expect.objectContaining({ scrimmageSessionId: { $in: [sessionId] } })
  );
});
function mergeSetup() {
  const fromPlayerId = 'e'.repeat(24),
    toPlayerId = 'f'.repeat(24);
  const mergedSeries = {
    ...series,
    playerMerges: [],
    save: jest.fn().mockResolvedValue(undefined),
  };
  repo.Scrimmage.findById.mockResolvedValue(mergedSeries);
  const players = [
    {
      _id: fromPlayerId,
      displayName: 'John copy',
      userId: 'linked-user',
      leaguePlayerId: 'd'.repeat(24),
    },
    { _id: toPlayerId, displayName: 'John', isActive: true },
  ];
  repo.ScrimmagePlayer.find.mockResolvedValue(players);
  repo.ScrimmageSession.exists.mockResolvedValue(false);
  findLeaguePlayerById.mockResolvedValue({ claimedByUserId: 'linked-user' });
  Game.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
  return { fromPlayerId, toPlayerId, mergedSeries, players };
}
test('duplicate resolution saves one atomic identity map and preserves original profile, claim and source data', async () => {
  const { fromPlayerId, toPlayerId, mergedSeries, players } = mergeSetup();
  const snapshot = JSON.stringify(players);
  await expect(
    service.mergePlayers(seriesId, fromPlayerId, owner, { toPlayerId })
  ).resolves.toMatchObject({
    player: { id: toPlayerId, displayName: 'John' },
    mergedPlayerId: fromPlayerId,
  });
  expect(mergedSeries.playerMerges).toEqual([
    { fromPlayerId, toPlayerId, mergedAt: expect.any(Date), mergedByUserId: owner },
  ]);
  expect(mergedSeries.save).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(players)).toBe(snapshot);
});
test('duplicate resolution requires admin access and rejects conflicting account identities', async () => {
  const { fromPlayerId, toPlayerId, mergedSeries, players } = mergeSetup();
  await expect(
    service.mergePlayers(seriesId, fromPlayerId, 'stranger', { toPlayerId })
  ).rejects.toMatchObject({ statusCode: 403 });
  players[1].userId = 'different-user';
  await expect(service.mergePlayers(seriesId, fromPlayerId, owner, { toPlayerId })).rejects.toThrow(
    'different accounts'
  );
  expect(mergedSeries.save).not.toHaveBeenCalled();
});
test('duplicate resolution rejects open attendance and profiles sharing a game', async () => {
  const { fromPlayerId, toPlayerId, mergedSeries } = mergeSetup();
  repo.ScrimmageSession.exists.mockResolvedValueOnce(true);
  await expect(service.mergePlayers(seriesId, fromPlayerId, owner, { toPlayerId })).rejects.toThrow(
    'Finish weekly sessions'
  );
  Game.find.mockReturnValue({
    lean: jest
      .fn()
      .mockResolvedValue([
        { homeRosterSnapshot: [{ _id: fromPlayerId }], awayRosterSnapshot: [{ _id: toPlayerId }] },
      ]),
  });
  await expect(service.mergePlayers(seriesId, fromPlayerId, owner, { toPlayerId })).rejects.toThrow(
    'same game'
  );
  expect(mergedSeries.save).not.toHaveBeenCalled();
});
test('merging a retained group again flattens old links to the new retained profile', async () => {
  const { fromPlayerId, toPlayerId, mergedSeries } = mergeSetup();
  mergedSeries.playerMerges = [
    {
      fromPlayerId: 'd'.repeat(24),
      toPlayerId: fromPlayerId,
      mergedAt: new Date(),
      mergedByUserId: owner,
    },
  ];
  await service.mergePlayers(seriesId, fromPlayerId, owner, { toPlayerId });
  expect(mergedSeries.playerMerges.map((entry) => String(entry.toPlayerId))).toEqual([
    toPlayerId,
    toPlayerId,
  ]);
});

test('series detail exposes the active tracker and public season MVP includes only published weeks', async () => {
  const { playerId, seasonId } = profileSetup();
  const makeWeek = (id, publishedAt) => {
    const value = {
      _id: id,
      scrimmageId: seriesId,
      seasonId,
      label: id,
      assignments: [],
      status: publishedAt ? 'completed' : 'open',
      publishedAt,
    };
    return { ...value, toObject: () => value };
  };
  const weeks = [makeWeek(sessionId, null), makeWeek('d'.repeat(24), new Date())];
  repo.ScrimmageSession.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(weeks) });
  repo.ScrimmagePlayer.find.mockReturnValue({
    sort: jest.fn().mockResolvedValue([{ _id: playerId, displayName: 'John', isActive: true }]),
  });
  const games = weeks.map((week) => ({
    _id: `game-${week._id}`,
    status: 'completed',
    scrimmageSessionId: week._id,
    homeRosterSnapshot: [{ _id: playerId, displayName: 'John' }],
    homeStartingLineupPlayerIds: [playerId],
    awayRosterSnapshot: [],
    scoringRules: { insideArc: 1, outsideArc: 2 },
    events: [{ playerId, statType: 'FG2_MADE', teamSide: 'home' }],
  }));
  games.push({
    _id: 'active-game',
    status: 'in_progress',
    scrimmageSessionId: sessionId,
    events: [],
  });
  Game.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(games) });
  const authRepo = require('../../modules/auth/auth.repository');
  jest.spyOn(authRepo, 'findUsersByIds').mockResolvedValue([]);
  const publicData = await service.detail(seriesId, null);
  expect(publicData.standings[0]).toMatchObject({ points: 1, gamesPlayed: 1 });
  expect(publicData.sessions[0]).toMatchObject({ activeGameId: 'active-game', gameCount: 2 });
  const adminData = await service.detail(seriesId, owner);
  expect(adminData.standings[0]).toMatchObject({ points: 2, gamesPlayed: 2 });
});
test('merged imported identities keep their source account restrictions when claiming', async () => {
  const { fromPlayerId, toPlayerId, mergedSeries, players } = mergeSetup();
  mergedSeries.isPublic = true;
  mergedSeries.playerMerges = [{ fromPlayerId, toPlayerId }];
  repo.ScrimmagePlayer.findOne.mockResolvedValue(players[1]);
  await expect(
    service.join(seriesId, 'different-user', {
      playerId: toPlayerId,
      accepted: true,
      signedName: 'Name',
      termsVersion: 'v',
    })
  ).rejects.toThrow('linked to another account');
  expect(repo.ScrimmageAcceptance.findOneAndUpdate).not.toHaveBeenCalled();
  players[0].userId = null;
  await expect(
    service.join(seriesId, 'different-user', {
      playerId: toPlayerId,
      accepted: true,
      signedName: 'Name',
      termsVersion: 'v',
    })
  ).rejects.toThrow('source profile belongs');
});
test('new games retain the approved user from a merged duplicate in canonical snapshots', async () => {
  const { weekly, assignments, payload } = weeklySetup();
  const mergedSeries = {
    ...series,
    playerMerges: [{ fromPlayerId: 'old-player', toPlayerId: 'p0' }],
  };
  repo.Scrimmage.findById.mockResolvedValue(mergedSeries);
  repo.ScrimmageSession.findOne.mockResolvedValue(weekly);
  repo.ScrimmageSession.findOneAndUpdate.mockResolvedValue(weekly);
  Game.findOne.mockResolvedValue(null);
  Game.countDocuments.mockResolvedValue(0);
  repo.ScrimmagePlayer.find.mockResolvedValue([
    ...assignments.map((player) => ({ _id: player.playerId, displayName: player.displayName })),
    { _id: 'old-player', userId: 'linked-user' },
  ]);
  createGame.mockResolvedValue({ _id: 'new-game' });
  await service.newGame(seriesId, sessionId, owner, payload);
  expect(createGame.mock.calls[0][0].homeRosterSnapshot[0]).toMatchObject({
    _id: 'p0',
    claimedByUserId: 'linked-user',
    isClaimed: true,
  });
});

test('import options include managed source filters and mark existing sources under their retained identity', async () => {
  const fromPlayerId = 'e'.repeat(24),
    toPlayerId = 'f'.repeat(24);
  repo.Scrimmage.findById.mockResolvedValue({
    ...series,
    playerMerges: [{ fromPlayerId, toPlayerId }],
  });
  const leagueRepo = require('../../modules/leagues/leagues.repository');
  leagueRepo.LeagueManager.find.mockReturnValue({
    select: jest.fn().mockResolvedValue([{ leagueId: 'managed-league' }]),
  });
  leagueRepo.League.find.mockReturnValue({
    select: jest.fn().mockResolvedValue([
      { _id: 'owned-league', name: 'Wednesday League' },
      { _id: 'managed-league', name: 'Saturday League' },
    ]),
  });
  leagueRepo.LeaguePlayer.find.mockReturnValue({
    select: jest.fn().mockResolvedValue([
      { _id: 'imported-league-player', displayName: 'John', leagueId: 'owned-league' },
      { _id: 'new-league-player', displayName: 'Kyle', leagueId: 'managed-league' },
    ]),
  });
  const teamRepo = require('../../modules/teams/teams.repository');
  jest.spyOn(teamRepo.Team, 'find').mockResolvedValue([
    {
      _id: 'owned-team',
      name: 'Practice Team',
      players: [
        { _id: 'imported-team-player', displayName: 'Kevin', isActive: true },
        { _id: 'inactive-team-player', displayName: 'Inactive', isActive: false },
      ],
    },
  ]);
  repo.ScrimmagePlayer.find.mockResolvedValue([
    { _id: fromPlayerId, leaguePlayerId: 'imported-league-player', isActive: false },
    { _id: toPlayerId },
    { _id: 'team-profile', sourceTeamId: 'owned-team', sourcePlayerId: 'imported-team-player' },
  ]);
  const result = await service.importOptions(seriesId, owner);
  expect(result.players).toHaveLength(3);
  expect(result.players.find((player) => player.displayName === 'John')).toMatchObject({
    sourceKey: 'league:owned-league',
    sourceType: 'league',
    alreadyInPool: true,
    poolPlayerId: toPlayerId,
  });
  expect(result.players.find((player) => player.displayName === 'Kevin')).toMatchObject({
    sourceKey: 'team:owned-team',
    sourceType: 'team',
    alreadyInPool: true,
    poolPlayerId: 'team-profile',
  });
  expect(result.players.find((player) => player.displayName === 'Kyle')).toMatchObject({
    sourceKey: 'league:managed-league',
    alreadyInPool: false,
    poolPlayerId: null,
  });
  expect(leagueRepo.League.find).toHaveBeenCalledWith({
    $or: [{ ownerUserId: owner }, { _id: { $in: ['managed-league'] } }],
  });
  expect(teamRepo.Team.find).toHaveBeenCalledWith({ ownerUserId: owner });
});
test('non-admins cannot list player import sources', async () => {
  await expect(service.importOptions(seriesId, 'stranger')).rejects.toMatchObject({
    statusCode: 403,
  });
  expect(require('../../modules/leagues/leagues.repository').League.find).not.toHaveBeenCalled();
});

test('attendance edits wait for the same setup lease as game creation and identity merges', async () => {
  repo.Scrimmage.findOneAndUpdate.mockResolvedValue(null);
  await expect(service.editAssignments(seriesId, sessionId, owner, [])).rejects.toMatchObject({
    statusCode: 409,
  });
  expect(repo.ScrimmageSession.findOne).not.toHaveBeenCalled();
  expect(repo.ScrimmagePlayer.find).not.toHaveBeenCalled();
});
test('attendance edits save under the setup lease and release it afterward', async () => {
  const playerId = 'e'.repeat(24);
  const session = {
    _id: sessionId,
    scrimmageId: seriesId,
    seasonId: 'f'.repeat(24),
    status: 'open',
    assignments: [],
    save: jest.fn(),
    toObject() {
      return { assignments: this.assignments };
    },
  };
  repo.ScrimmageSession.findOne.mockResolvedValue(session);
  Game.exists.mockResolvedValue(false);
  repo.ScrimmagePlayer.find.mockResolvedValue([{ _id: playerId, displayName: 'John' }]);
  await service.editAssignments(seriesId, sessionId, owner, [{ playerId, color: 'red' }]);
  expect(session.assignments).toEqual([{ playerId, color: 'red', displayName: 'John' }]);
  expect(session.save).toHaveBeenCalledTimes(1);
  expect(repo.Scrimmage.updateOne).toHaveBeenCalledWith(
    expect.objectContaining({ _id: seriesId, setupLeaseKey: expect.any(String) }),
    { $set: { setupLeaseKey: null, setupLeaseUntil: null } }
  );
});
