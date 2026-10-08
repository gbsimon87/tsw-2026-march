// Fixtures for seed.js --scrimmages. The entry point owns dev-target checks and
// connection lifetime; this module never resets or connects to a database.
const { createHash } = require('node:crypto');
const mongoose = require('mongoose');
const repo = require('../modules/scrimmages/scrimmages.repository');
const { Game } = require('../modules/games/games.repository');
const { CURRENT_COURT_LAYOUT_ID } = require('../modules/shared/courtLayouts');
const {
  computeBoxScore,
  computeGameFinalScore,
  buildGameSummary,
} = require('../modules/games/games.service');
const { extractYouTubeVideoId } = require('../modules/shared/youtube');
const { aggregateScrimmageStats } = require('../modules/scrimmages/scrimmages.scoring');

const COLORS = ['red', 'white', 'blue', 'black'];
const NAMES = [
  'John Rivera',
  'Kyle Bennett',
  'Kevin Brooks',
  'Alex Morgan',
  'Sam Carter',
  'Jordan Blake',
  'Casey Ellis',
  'Drew Parker',
  'Taylor Reed',
  'Jamie Cruz',
  'Chris Adams',
  'Morgan Hayes',
  'Riley Scott',
  'Cameron Lee',
  'Avery Young',
  'Devin Ross',
  'Skyler Ward',
  'Robin Cole',
  'Jesse Lewis',
  'Quinn Davis',
  'Charlie Guest',
  'Finley Guest',
  'Inactive Demo Player',
];
const PASSWORD = 'password1!2@3#';
const MVP_RULES = {
  missPenalty: 1,
  turnoverPenalty: 2,
  winBonus: 2,
  lossPenalty: 1,
  weeklyMinGames: 3,
  seasonMinGames: 6,
  seasonMinWeeks: 2,
};
const VIDEO_URL = 'https://www.youtube.com/watch?v=8UfBBSix-2k';
function fixtureId(key) {
  return new mongoose.Types.ObjectId(
    createHash('sha256').update(`tsw-we-ball-demo-v1:${key}`).digest('hex').slice(0, 24)
  );
}
function buildScrimmageFixtures({
  ownerUserId,
  managerUserId,
  playerUserId,
  pendingUserId,
  now = new Date(),
  videoUrl = VIDEO_URL,
  sourcePlayers = [],
  sessionDates = {},
}) {
  const result = {
    series: [],
    players: [],
    sessions: [],
    games: [],
    acceptances: [],
    requests: [],
  };
  for (const [seriesIndex, day] of ['Wednesdays', 'Saturdays'].entries()) {
    const key = day.toLowerCase();
    const scrimmageId = fixtureId(key);
    const seasonId = fixtureId(`${key}:season-current`);
    const previousSeasonId = fixtureId(`${key}:season-previous`);
    // Align fixtures to their named weekday and keep relative dates stable on rerun.
    const currentDate = new Date(now);
    currentDate.setUTCHours(18, 0, 0, 0);
    const weekday = seriesIndex === 0 ? 3 : 6;
    currentDate.setUTCDate(
      currentDate.getUTCDate() - ((currentDate.getUTCDay() - weekday + 7) % 7)
    );
    const terms = {
      text: 'Fictional development demonstration. Play respectfully, follow the organiser’s safety instructions and report injuries. These sample signatures are not real participant consent or permission to publish footage.',
      version: '',
    };
    terms.version = createHash('sha256').update(terms.text).digest('hex');
    result.series.push({
      _id: scrimmageId,
      ownerUserId,
      managerUserIds: [managerUserId],
      name: `We-ball ${day}`,
      isPublic: true,
      terms,
      termsScope: 'series',
      activeSeasonId: seasonId,
      seasons: [
        {
          _id: previousSeasonId,
          label: 'Previous season',
          startedAt: new Date(currentDate.getTime() - 70 * 86400000),
          endedAt: new Date(currentDate.getTime() - 35 * 86400000),
          mvpRules: MVP_RULES,
        },
        {
          _id: seasonId,
          label: 'Demo season',
          startedAt: new Date(currentDate.getTime() - 35 * 86400000),
          mvpRules: MVP_RULES,
        },
      ],
    });
    const players = NAMES.map((displayName, index) => ({
      _id: fixtureId(`${key}:player:${index}`),
      scrimmageId,
      displayName,
      isActive: index !== 22,
      userId: index === 0 ? playerUserId : null,
    }));
    result.players.push(
      ...players,
      ...sourcePlayers.map((player) => ({
        _id: fixtureId(`${key}:import:${player._id}`),
        scrimmageId,
        displayName: player.displayName,
        leaguePlayerId: player._id,
        isActive: true,
      }))
    );
    const acceptedAt = new Date(currentDate.getTime() - 36 * 86400000);
    for (const [index, userId, status] of [
      [0, playerUserId, 'approved'],
      [1, pendingUserId, 'pending'],
    ]) {
      const acceptanceId = fixtureId(`${key}:acceptance:${index}`);
      result.acceptances.push({
        _id: acceptanceId,
        scrimmageId,
        userId,
        sessionId: null,
        termsVersion: terms.version,
        termsText: terms.text,
        signedName: players[index].displayName,
        acceptedAt,
      });
      result.requests.push({
        _id: fixtureId(`${key}:claim:${index}`),
        scrimmageId,
        playerId: players[index]._id,
        userId,
        displayName: players[index].displayName,
        acceptanceId,
        status,
      });
    }
    for (let week = 0; week < 6; week += 1) {
      const weeklySeasonId = week === 0 ? previousSeasonId : seasonId;
      const sessionId = fixtureId(`${key}:week:${week}`);
      const date = sessionDates[String(sessionId)]
        ? new Date(`${sessionDates[String(sessionId)]}T18:00:00.000Z`)
        : new Date(currentDate.getTime() - (5 - week) * 7 * 86400000);
      const assignments = players.slice(0, 22).map((player, index) => ({
        playerId: player._id,
        displayName: player.displayName,
        color: COLORS[index < 20 ? Math.floor(index / 5) : index - 20],
      }));
      // Two regulars change colors in a later week, demonstrating per-week teams.
      if (week === 3)
        [assignments[4].color, assignments[9].color] = [assignments[9].color, assignments[4].color];
      const published = week < 4;
      const session = {
        _id: sessionId,
        scrimmageId,
        seasonId: weeklySeasonId,
        label: week === 0 ? 'Previous season · Week 1' : `Week ${week}`,
        date: date.toISOString().slice(0, 10),
        videoUrl,
        terms,
        termsScope: 'series',
        assignments,
        scoringRules: { insideArc: 1, outsideArc: 2 },
        regulationSeconds: 240,
        overtimeSeconds: 240,
        status: week === 5 ? 'open' : 'completed',
        publishedAt: published ? new Date(date.getTime() + 2 * 3600000) : null,
        publishedByUserId: published ? ownerUserId : null,
      };
      result.sessions.push(session);
      const pairs = [
        [0, 1],
        [2, 3],
        [0, 2],
        [1, 3],
        [0, 3],
        [1, 2],
      ];
      for (const [gameIndex, [homeColor, awayColor]] of pairs.entries()) {
        if (week === 5 && gameIndex > 2) continue;
        const gameId = fixtureId(`${key}:week:${week}:game:${gameIndex}`);
        const live = week === 5 && gameIndex === 2;
        const videoStartTimestamp = gameIndex * 600;
        function roster(colorIndex) {
          const color = COLORS[colorIndex];
          let selection = assignments
            .filter(
              (player) =>
                player.color === color &&
                ![players[20]._id.toString(), players[21]._id.toString()].includes(
                  player.playerId.toString()
                )
            )
            .slice(0, 5);
          if (week === 3 && gameIndex === 0 && colorIndex < 2)
            selection = [assignments[20 + colorIndex], ...selection.slice(1)];
          return selection.map((player, index) => ({
            _id: player.playerId,
            sourceType: 'scrimmage_player',
            sourcePlayerId: player.playerId,
            displayName: player.displayName,
            jerseyNumber: index + 1,
            isActive: true,
            claimedByUserId:
              player.playerId.toString() === players[0]._id.toString() ? playerUserId : null,
            isClaimed: player.playerId.toString() === players[0]._id.toString(),
          }));
        }
        const homeRosterSnapshot = roster(homeColor),
          awayRosterSnapshot = roster(awayColor);
        const scheduledAt = new Date(date.getTime() + videoStartTimestamp * 1000);
        const game = {
          _id: gameId,
          ownerUserId,
          gameContext: 'scrimmage',
          trackingMode: 'dual_team',
          scrimmageId,
          scrimmageSessionId: sessionId,
          scrimmageSeasonId: weeklySeasonId,
          scrimmageRequestId: `demo-${gameId}`,
          scrimmageActive: live,
          title: `${session.label} · Game ${gameIndex + 1}`,
          status: live ? 'in_progress' : 'completed',
          courtLayoutId: CURRENT_COURT_LAYOUT_ID,
          homeParticipant: {
            side: 'home',
            participantType: 'scrimmage_color',
            displayName: `Team ${COLORS[homeColor]}`,
            colors: [COLORS[homeColor]],
          },
          awayParticipant: {
            side: 'away',
            participantType: 'scrimmage_color',
            displayName: `Team ${COLORS[awayColor]}`,
            colors: [COLORS[awayColor]],
          },
          homeRosterSnapshot,
          awayRosterSnapshot,
          homeStartingLineupPlayerIds: homeRosterSnapshot.map((player) => player._id),
          homeCurrentLineupPlayerIds: homeRosterSnapshot.map((player) => player._id),
          awayStartingLineupPlayerIds: awayRosterSnapshot.map((player) => player._id),
          awayCurrentLineupPlayerIds: awayRosterSnapshot.map((player) => player._id),
          scoringRules: session.scoringRules,
          gameFormat: {
            regulationSegmentType: 'scrimmage',
            regulationSegmentDurationSeconds: 240,
            overtimeDurationSeconds: 240,
          },
          clock: {
            status: live ? 'paused' : 'segment_complete',
            segmentKind: 'regulation',
            segmentNumber: 1,
            remainingMilliseconds: live ? 120000 : 0,
            runningSince: null,
          },
          videoUrl,
          videoStartTimestamp,
          scheduledAt,
          createdAt: scheduledAt,
          updatedAt: new Date(scheduledAt.getTime() + 240000),
          completedAt: live ? null : new Date(scheduledAt.getTime() + 240000),
          events: [],
        };
        for (const [side, rosterPlayers] of [
          ['home', homeRosterSnapshot],
          ['away', awayRosterSnapshot],
        ]) {
          for (const [index, player] of rosterPlayers.entries()) {
            const variant = index + gameIndex + week + seriesIndex + (side === 'away' ? 2 : 0);
            const stats = [
              'FG2_MADE',
              variant % 2 ? 'FG3_MADE' : 'FG2_MADE',
              'FG2_MISS',
              ...(variant % 3 ? ['FG3_MISS'] : []),
              ...(variant % 4 ? ['TOV'] : []),
              ...(variant % 3 === 0 ? ['FG3_MADE'] : []),
            ];
            for (const statType of stats) {
              const elapsed = 5 + game.events.length * 2;
              const outside = statType.startsWith('FG3');
              game.events.push({
                _id: fixtureId(`${gameId}:event:${game.events.length}`),
                playerId: player._id,
                teamSide: side,
                statType,
                ...(statType !== 'TOV'
                  ? {
                      zoneId: outside ? 'TOP_KEY' : 'PAINT',
                      x: outside ? 50 : 45,
                      y: outside ? 38 : 85,
                    }
                  : {}),
                occurredAt: new Date(scheduledAt.getTime() + elapsed * 1000),
                videoTimestamp: videoStartTimestamp + elapsed,
                segmentKind: 'regulation',
                segmentNumber: 1,
                clockMillisecondsRemaining: (240 - elapsed) * 1000,
              });
            }
          }
        }
        game.finalScore = computeGameFinalScore(game);
        game.boxScore = computeBoxScore(game, null, {
          participants: {
            home: { teamDoc: { players: homeRosterSnapshot } },
            away: { teamDoc: { players: awayRosterSnapshot } },
          },
        });
        game.gameSummary = buildGameSummary(game);
        game.eventCount = game.events.length;
        result.games.push(game);
      }
    }
  }
  return result;
}

async function insertMissing(Model, documents, scopeField) {
  // Validate the complete batch before its first write, including embedded events.
  for (const document of documents) {
    const error = new Model(document).validateSync();
    if (error) throw error;
  }
  const existing = await Model.find({ _id: { $in: documents.map((document) => document._id) } });
  const existingIds = new Set(existing.map((document) => String(document._id)));
  for (const document of existing) {
    const expected = documents.find((fixture) => String(fixture._id) === String(document._id));
    if (String(document[scopeField]) !== String(expected[scopeField]))
      throw new Error(`Refusing to reuse conflicting ${Model.modelName} demo ID ${document._id}`);
  }
  const missing = documents.filter((document) => !existingIds.has(String(document._id)));
  if (missing.length) await Model.insertMany(missing, { ordered: true });
  return missing.length;
}

async function seedScrimmages({
  upsertUser,
  videoUrl = process.env.SCRIMMAGE_DEMO_VIDEO_URL || VIDEO_URL,
}) {
  if (!extractYouTubeVideoId(videoUrl))
    throw new Error('SCRIMMAGE_DEMO_VIDEO_URL must be a valid YouTube video URL');
  const owner = (
    await upsertUser({
      email: 'testuser@gmail.com',
      name: 'Demo Sporty',
      password: PASSWORD,
      onboardingRoles: ['league_manager', 'player'],
    })
  ).user;
  const manager = (
    await upsertUser({
      email: 'we-ball-coach@tsw.demo',
      name: 'We-ball Demo Coach',
      password: PASSWORD,
      onboardingRoles: ['league_manager'],
    })
  ).user;
  const player = (
    await upsertUser({ email: 'we-ball-player@tsw.demo', name: NAMES[0], password: PASSWORD })
  ).user;
  const pending = (
    await upsertUser({ email: 'we-ball-pending@tsw.demo', name: NAMES[1], password: PASSWORD })
  ).user;
  const { League, LeaguePlayer } = require('../modules/leagues/leagues.repository');
  const leagues = await League.find({ ownerUserId: owner._id }).select('_id');
  const sourcePlayers = await LeaguePlayer.find({
    leagueId: { $in: leagues.map((league) => league._id) },
    isActive: true,
  }).limit(2);
  const previousWeeks = await repo.ScrimmageSession.find({
    scrimmageId: { $in: ['wednesdays', 'saturdays'].map(fixtureId) },
  }).select('_id date');
  const sessionDates = Object.fromEntries(
    previousWeeks.map((week) => [String(week._id), week.date])
  );
  const fixtures = buildScrimmageFixtures({
    sessionDates,
    ownerUserId: owner._id,
    managerUserId: manager._id,
    playerUserId: player._id,
    pendingUserId: pending._id,
    videoUrl,
    sourcePlayers,
  });
  // A user-created name collision must not silently create a second demo series.
  for (const series of fixtures.series) {
    const collision = await repo.Scrimmage.findOne({ name: series.name, _id: { $ne: series._id } });
    if (collision)
      throw new Error(
        `A scrimmage named ${series.name} already exists. Demo seed leaves it unchanged; use its current data or choose a fresh development database.`
      );
  }
  const created = {};
  for (const [key, Model, scopeField] of [
    ['series', repo.Scrimmage, 'ownerUserId'],
    ['players', repo.ScrimmagePlayer, 'scrimmageId'],
    ['sessions', repo.ScrimmageSession, 'scrimmageId'],
    ['acceptances', repo.ScrimmageAcceptance, 'scrimmageId'],
    ['requests', repo.ScrimmageJoinRequest, 'scrimmageId'],
    ['games', Game, 'scrimmageSessionId'],
  ]) {
    created[key] = await insertMissing(Model, fixtures[key], scopeField);
  }
  console.log('We-ball scrimmage demo ready (existing fixtures and edits preserved).');
  console.log(
    `Created: ${Object.entries(created)
      .map(([key, count]) => `${count} ${key}`)
      .join(', ')}`
  );
  for (const series of fixtures.series) {
    const seasonGames = fixtures.games.filter(
      (game) =>
        String(game.scrimmageId) === String(series._id) &&
        String(game.scrimmageSeasonId) === String(series.activeSeasonId) &&
        fixtures.sessions.some(
          (week) => String(week._id) === String(game.scrimmageSessionId) && week.publishedAt
        )
    );
    const eligible = aggregateScrimmageStats(seasonGames, MVP_RULES, 'season').filter(
      (row) => row.eligible
    ).length;
    console.log(
      `${series.name}: /admin/scrimmage/${series._id} (${eligible} eligible season MVP players in the fixture blueprint)`
    );
  }
  console.log('Owner: testuser@gmail.com; additional admin: we-ball-coach@tsw.demo');
  console.log(
    'Approved player: we-ball-player@tsw.demo; pending claimant: we-ball-pending@tsw.demo'
  );
  console.log(`Initial demo password: ${PASSWORD} (existing credentials are preserved).`);
  return { fixtures, created };
}
module.exports = { buildScrimmageFixtures, fixtureId, insertMissing, seedScrimmages, MVP_RULES };
