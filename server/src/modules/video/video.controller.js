const { ApiError } = require('../../utils/apiError');
const videoService = require('./video.service');
const {
  gameVideoParamsSchema,
  videoPlaybackQuerySchema,
  videoUploadAttemptParamsSchema,
  createVideoUploadSchema,
} = require('./video.validation');

function requireAuthUserId(req) {
  if (!req.auth?.userId) throw new ApiError(401, 'Unauthorized');
  return req.auth.userId;
}

// POST /games/:gameId/video/uploads → 201 { uploadUrl, attemptId, video }.
// The upload URL is a bearer credential: the route is no-store and the body
// is never logged.
async function createUpload(req, res) {
  const userId = requireAuthUserId(req);
  const { gameId } = gameVideoParamsSchema.parse(req.params);
  // sizeBytes/mimeType: usability validation only (R2); not passed on.
  const { sameRecording } = createVideoUploadSchema.parse(req.body);
  const result = await videoService.createGameVideoUpload({
    userId,
    gameId,
    origin: req.headers.origin,
    sameRecording,
  });
  res.status(201).json(result);
}

// DELETE /games/:gameId/video/uploads/:attemptId → 204 (idempotent).
async function cancelUpload(req, res) {
  const userId = requireAuthUserId(req);
  const { gameId, attemptId } = videoUploadAttemptParamsSchema.parse(req.params);
  await videoService.cancelGameVideoUpload({ userId, gameId, attemptId });
  res.status(204).end();
}

// DELETE /games/:gameId/video → 200 { video: null }.
async function remove(req, res) {
  const userId = requireAuthUserId(req);
  const { gameId } = gameVideoParamsSchema.parse(req.params);
  const result = await videoService.removeGameVideo({ userId, gameId });
  res.status(200).json(result);
}

async function playback(req, res) {
  const { gameId } = gameVideoParamsSchema.parse(req.params);
  const { eventId } = videoPlaybackQuerySchema.parse(req.query);
  res.json(
    await videoService.getGameVideoPlayback({
      userId: req.auth?.userId || null,
      gameId,
      eventId: eventId || null,
    })
  );
}

async function webhook(req, res) {
  await videoService.handleMuxWebhook({
    rawBody: req.body,
    signatureHeader: req.headers['mux-signature'],
  });
  res.status(200).json({ received: true });
}

module.exports = {
  playback,
  webhook,
  createUpload,
  cancelUpload,
  remove,
};
