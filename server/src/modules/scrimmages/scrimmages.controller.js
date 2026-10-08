const service = require('./scrimmages.service');
const schema = require('./scrimmages.validation');
const { ApiError } = require('../../utils/apiError');
function seriesId(req) {
  return schema.id.parse(req.params.scrimmageId);
}
function sessionId(req) {
  return schema.id.parse(req.params.sessionId);
}
const controller = {
  list: async (req, res) => res.json(await service.list(req.auth?.userId)),
  managed: async (req, res) => res.json(await service.list(req.auth.userId, true)),
  profiles: async (req, res) => res.json(await service.profiles(req.auth.userId)),
  playerProfile: async (req, res) =>
    res.json(
      await service.playerProfile(
        seriesId(req),
        schema.id.parse(req.params.playerId),
        req.auth?.userId,
        {
          seasonId: req.query.seasonId ? schema.id.parse(req.query.seasonId) : undefined,
          sessionId: req.query.sessionId ? schema.id.parse(req.query.sessionId) : undefined,
        }
      )
    ),
  create: async (req, res) =>
    res.status(201).json(await service.create(req.auth.userId, schema.create.parse(req.body))),
  detail: async (req, res) =>
    res.json(
      await service.detail(
        seriesId(req),
        req.auth?.userId,
        req.query.seasonId ? schema.id.parse(req.query.seasonId) : undefined
      )
    ),
  update: async (req, res) =>
    res.json(await service.update(seriesId(req), req.auth.userId, schema.update.parse(req.body))),
  addPlayer: async (req, res) =>
    res
      .status(201)
      .json(await service.addPlayer(seriesId(req), req.auth.userId, schema.player.parse(req.body))),
  importOptions: async (req, res) =>
    res.json(await service.importOptions(seriesId(req), req.auth.userId)),
  mergePlayers: async (req, res) =>
    res.json(
      await service.mergePlayers(
        seriesId(req),
        schema.id.parse(req.params.playerId),
        req.auth.userId,
        schema.mergePlayers.parse(req.body)
      )
    ),
  updatePlayer: async (req, res) =>
    res.json(
      await service.updatePlayer(
        seriesId(req),
        schema.id.parse(req.params.playerId),
        req.auth.userId,
        schema.updatePlayer.parse(req.body)
      )
    ),
  createSession: async (req, res) =>
    res
      .status(201)
      .json(
        await service.createSession(seriesId(req), req.auth.userId, schema.session.parse(req.body))
      ),
  sessionDetail: async (req, res) =>
    res.json(await service.sessionDetail(seriesId(req), sessionId(req), req.auth?.userId)),
  editAssignments: async (req, res) =>
    res.json(
      await service.editAssignments(
        seriesId(req),
        sessionId(req),
        req.auth.userId,
        schema.assignments.parse(req.body.assignments)
      )
    ),
  publishSession: async (req, res) =>
    res.json(await service.publishSession(seriesId(req), sessionId(req), req.auth.userId)),
  finishSession: async (req, res) =>
    res.json(await service.finishSession(seriesId(req), sessionId(req), req.auth.userId)),
  resetSeason: async (req, res) =>
    res.json(
      await service.resetSeason(seriesId(req), req.auth.userId, schema.season.parse(req.body))
    ),
  join: async (req, res) =>
    res.json(await service.join(seriesId(req), req.auth.userId, schema.join.parse(req.body))),
  acceptSession: async (req, res) =>
    res.json(
      await service.acceptSession(
        seriesId(req),
        sessionId(req),
        req.auth.userId,
        schema.accept.parse(req.body)
      )
    ),
  requests: async (req, res) => res.json(await service.requests(seriesId(req), req.auth.userId)),
  review: async (req, res) =>
    res.json(
      await service.review(
        seriesId(req),
        schema.id.parse(req.params.requestId),
        req.auth.userId,
        schema.review.parse(req.body)
      )
    ),
  newGame: async (req, res) =>
    res
      .status(201)
      .json(
        await service.newGame(
          seriesId(req),
          sessionId(req),
          req.auth.userId,
          schema.game.parse(req.body)
        )
      ),
};
module.exports = Object.fromEntries(
  Object.entries(controller).map(([key, handler]) => [
    key,
    async (req, res) => {
      try {
        return await handler(req, res);
      } catch (error) {
        if (error.code === 11000)
          throw new ApiError(409, 'This player, claim or game already exists');
        if (error.name === 'VersionError')
          throw new ApiError(409, 'Another admin changed this record. Refresh and try again');
        throw error;
      }
    },
  ])
);
