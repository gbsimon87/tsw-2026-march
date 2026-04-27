const { ApiError } = require('../../utils/apiError');
const gamesService = require('./games.service');
const {
  createGameSchema,
  updateGameSchema,
  appendEventSchema,
  setLineupSchema,
} = require('./games.validation');

function requireAuthUserId(req) {
  if (!req.auth?.userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  return req.auth.userId;
}

async function create(req, res) {
  const userId = requireAuthUserId(req);
  const payload = createGameSchema.parse(req.body);
  const game = await gamesService.createGameForUser(userId, payload);
  res.status(201).json({ game });
}

async function list(req, res) {
  const userId = requireAuthUserId(req);
  const filter = {
    teamId: req.query.teamId,
    status: req.query.status,
  };
  const games = await gamesService.listGamesForUser(userId, filter);
  res.status(200).json({ games });
}

async function update(req, res) {
  const userId = requireAuthUserId(req);
  const payload = updateGameSchema.parse(req.body);
  const result = await gamesService.updateGameForUser(userId, req.params.gameId, payload);
  res.status(200).json(result);
}

async function getById(req, res) {
  const userId = requireAuthUserId(req);
  const result = await gamesService.getGameForUser(userId, req.params.gameId);
  res.status(200).json(result);
}

async function getPublicById(req, res) {
  const result = await gamesService.getPublicGame(req.params.gameId);
  res.status(200).json(result);
}

async function appendEvent(req, res) {
  const userId = requireAuthUserId(req);
  const payload = appendEventSchema.parse(req.body);
  const result = await gamesService.appendEventForUser(userId, req.params.gameId, payload);
  res.status(200).json(result);
}

async function setLineup(req, res) {
  const userId = requireAuthUserId(req);
  const payload = setLineupSchema.parse(req.body);
  const result = await gamesService.setGameLineup(userId, req.params.gameId, payload);
  res.status(200).json(result);
}

async function removeEvent(req, res) {
  const userId = requireAuthUserId(req);
  const result = await gamesService.removeEventForUser(
    userId,
    req.params.gameId,
    req.params.eventId
  );
  res.status(200).json(result);
}

async function finish(req, res) {
  const userId = requireAuthUserId(req);
  const result = await gamesService.finishGameForUser(userId, req.params.gameId);
  res.status(200).json(result);
}

module.exports = {
  create,
  list,
  update,
  getById,
  getPublicById,
  appendEvent,
  setLineup,
  removeEvent,
  finish,
};
