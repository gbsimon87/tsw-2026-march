const { ApiError } = require('../../utils/apiError');
const service = require('./feed.service');
const { listFeedSchema, shareableLookupSchema } = require('./feed.validation');

function requireAuthUserId(req) {
  if (!req.auth?.userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  return req.auth.userId;
}

async function list(req, res) {
  const query = listFeedSchema.parse(req.query);
  const result = await service.listFeedPosts(req.auth?.userId || null, query);
  res.status(200).json(result);
}

async function createImage(req, res) {
  const userId = requireAuthUserId(req);
  const post = await service.createImagePostForUser(userId, req.file, req.body.caption);
  res.status(201).json({ post });
}

async function createVideo(req, res) {
  const userId = requireAuthUserId(req);
  const post = await service.createVideoPostForUser(userId, req.file, req.body.caption);
  res.status(201).json({ post });
}

async function createGameCard(req, res) {
  const userId = requireAuthUserId(req);
  const post = await service.createGameCardPostForUser(userId, req.body);
  res.status(201).json({ post });
}

async function createPlayerCard(req, res) {
  const userId = requireAuthUserId(req);
  const post = await service.createPlayerCardPostForUser(userId, req.body);
  res.status(201).json({ post });
}

async function createTeamCard(req, res) {
  const userId = requireAuthUserId(req);
  const post = await service.createTeamCardPostForUser(userId, req.body);
  res.status(201).json({ post });
}

async function createHighlightClip(req, res) {
  const userId = requireAuthUserId(req);
  const post = await service.createHighlightClipPostForUser(userId, req.body);
  res.status(201).json({ post });
}

async function remove(req, res) {
  const userId = requireAuthUserId(req);
  const result = await service.deletePostForUser(userId, req.params.postId);
  res.status(200).json(result);
}

async function listShareableGames(req, res) {
  const query = shareableLookupSchema.parse(req.query);
  const games = await service.listShareableGames(query);
  res.status(200).json({ games });
}

async function listShareablePlayers(req, res) {
  const query = shareableLookupSchema.parse(req.query);
  const players = await service.listShareablePlayers(query);
  res.status(200).json({ players });
}

async function listShareableTeams(req, res) {
  const query = shareableLookupSchema.parse(req.query);
  const teams = await service.listShareableTeams(query);
  res.status(200).json({ teams });
}

module.exports = {
  list,
  createImage,
  createVideo,
  createGameCard,
  createPlayerCard,
  createTeamCard,
  createHighlightClip,
  remove,
  listShareableGames,
  listShareablePlayers,
  listShareableTeams,
};
