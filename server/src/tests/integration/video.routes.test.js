// Mux game video Task 4 — HTTP contract for upload/cancel/remove (consumed by
// the T8/T12 client). The service is mocked; this pins routing, auth, Zod
// validation, status codes, the error envelope and `Cache-Control: private,
// no-store` on every /video response (success and error alike, R2).
const request = require('supertest');

jest.mock('../../middleware/rateLimit.middleware', () => {
  const passThrough = (_req, _res, next) => next();
  return {
    apiRateLimiter: passThrough,
    authRecoveryLimiter: passThrough,
    authCredentialLimiter: passThrough,
    contactLimiter: passThrough,
    checkoutLimiter: passThrough,
    videoUploadLimiter: jest.fn(passThrough),
  };
});

jest.mock('../../modules/video/video.service', () => ({
  createGameVideoUpload: jest.fn(),
  cancelGameVideoUpload: jest.fn(),
  removeGameVideo: jest.fn(),
}));

const { videoUploadLimiter } = require('../../middleware/rateLimit.middleware');
const videoService = require('../../modules/video/video.service');
const { ApiError } = require('../../utils/apiError');
const { createApp } = require('../../app');
const { signAccessToken } = require('../../services/token.service');

const ORIGIN = 'http://localhost:5173';
const USER_ID = '64b7f0c2a1b2c3d4e5f6071a';
const GAME_ID = '64b7f0c2a1b2c3d4e5f60718';
const ATTEMPT_ID = '64b7f0c2a1b2c3d4e5f6071b';
const UPLOAD_URL = 'https://storage.googleapis.com/video-storage-upload/secret-signed-url';
const NO_STORE = 'private, no-store';
const BODY = { sizeBytes: 3 * 1024 ** 3, mimeType: 'video/mp4' };

function authed(method, path) {
  return request(createApp())
    [method](path)
    .set('Authorization', `Bearer ${signAccessToken({ sub: USER_ID, sid: 'session-1' })}`)
    .set('Origin', ORIGIN);
}

const uploadsPath = `/api/v1/games/${GAME_ID}/video/uploads`;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/v1/games/:gameId/video/uploads', () => {
  test('201 { uploadUrl, attemptId, video } with private, no-store; Origin passed to the service', async () => {
    const video = {
      provider: 'mux',
      status: 'uploading',
      durationSeconds: null,
      errorMessage: null,
      version: 1759579200000,
    };
    videoService.createGameVideoUpload.mockResolvedValue({
      uploadUrl: UPLOAD_URL,
      attemptId: ATTEMPT_ID,
      video,
    });

    const res = await authed('post', uploadsPath).send({ ...BODY, sameRecording: true });

    expect(res.statusCode).toBe(201);
    expect(res.headers['cache-control']).toBe(NO_STORE);
    expect(res.body).toEqual({ uploadUrl: UPLOAD_URL, attemptId: ATTEMPT_ID, video });
    expect(videoService.createGameVideoUpload).toHaveBeenCalledWith({
      userId: USER_ID,
      gameId: GAME_ID,
      origin: ORIGIN,
      sameRecording: true,
    });
    expect(videoUploadLimiter).toHaveBeenCalledTimes(1);
  });

  test('sameRecording defaults to false', async () => {
    videoService.createGameVideoUpload.mockResolvedValue({ uploadUrl: UPLOAD_URL });

    await authed('post', uploadsPath).send(BODY);

    expect(videoService.createGameVideoUpload).toHaveBeenCalledWith(
      expect.objectContaining({ sameRecording: false })
    );
  });

  test('401 without auth — still no-store, limiter never reached', async () => {
    const res = await request(createApp()).post(uploadsPath).set('Origin', ORIGIN).send(BODY);

    expect(res.statusCode).toBe(401);
    expect(res.headers['cache-control']).toBe(NO_STORE);
    expect(videoUploadLimiter).not.toHaveBeenCalled();
    expect(videoService.createGameVideoUpload).not.toHaveBeenCalled();
  });

  test('400 for a malformed game id (never reaches a CastError)', async () => {
    const res = await authed('post', '/api/v1/games/not-an-id/video/uploads').send(BODY);

    expect(res.statusCode).toBe(400);
    expect(res.headers['cache-control']).toBe(NO_STORE);
    expect(videoService.createGameVideoUpload).not.toHaveBeenCalled();
  });

  test.each([
    ['missing body', {}],
    ['zero size', { ...BODY, sizeBytes: 0 }],
    ['fractional size', { ...BODY, sizeBytes: 1.5 }],
    ['over 20 GiB', { ...BODY, sizeBytes: 20 * 1024 ** 3 + 1 }],
    ['not a video type', { ...BODY, mimeType: 'image/png' }],
    ['non-boolean sameRecording', { ...BODY, sameRecording: 'yes' }],
  ])('400 for %s (usability validation, R2)', async (_label, body) => {
    const res = await authed('post', uploadsPath).send(body);

    expect(res.statusCode).toBe(400);
    expect(videoService.createGameVideoUpload).not.toHaveBeenCalled();
  });

  test('exactly 20 GiB is accepted', async () => {
    videoService.createGameVideoUpload.mockResolvedValue({ uploadUrl: UPLOAD_URL });

    const res = await authed('post', uploadsPath).send({ ...BODY, sizeBytes: 20 * 1024 ** 3 });

    expect(res.statusCode).toBe(201);
  });

  test.each([
    [403, 'league_not_granted'],
    [403, 'origin_not_allowed'],
    [409, 'video_exists'],
    [409, 'upload_conflict'],
    [429, 'quota_exceeded'],
  ])('%s %s → error envelope with details.reason and no-store', async (status, reason) => {
    videoService.createGameVideoUpload.mockRejectedValue(
      new ApiError(status, 'Video upload is not available for this game.', { reason })
    );

    const res = await authed('post', uploadsPath).send(BODY);

    expect(res.statusCode).toBe(status);
    expect(res.headers['cache-control']).toBe(NO_STORE);
    expect(res.body.error).toMatchObject({
      message: 'Video upload is not available for this game.',
      details: { reason },
    });
  });

  test('502 provider failure: masked message, machine reason kept, no-store', async () => {
    videoService.createGameVideoUpload.mockRejectedValue(
      new ApiError(502, 'Could not start the upload. Please try again.', {
        reason: 'provider_unavailable',
      })
    );

    const res = await authed('post', uploadsPath).send(BODY);

    expect(res.statusCode).toBe(502);
    expect(res.headers['cache-control']).toBe(NO_STORE);
    expect(res.body.error).toMatchObject({
      message: 'Internal server error',
      details: { reason: 'provider_unavailable' },
    });
  });
});

describe('DELETE /api/v1/games/:gameId/video/uploads/:attemptId', () => {
  test('204 with no body', async () => {
    videoService.cancelGameVideoUpload.mockResolvedValue({ cancelled: true });

    const res = await authed('delete', `${uploadsPath}/${ATTEMPT_ID}`);

    expect(res.statusCode).toBe(204);
    expect(res.text).toBe('');
    expect(res.headers['cache-control']).toBe(NO_STORE);
    expect(videoService.cancelGameVideoUpload).toHaveBeenCalledWith({
      userId: USER_ID,
      gameId: GAME_ID,
      attemptId: ATTEMPT_ID,
    });
    expect(videoUploadLimiter).not.toHaveBeenCalled();
  });

  test('204 for an attempt that already ended (idempotent)', async () => {
    videoService.cancelGameVideoUpload.mockResolvedValue({ cancelled: false, status: 'cancelled' });

    const res = await authed('delete', `${uploadsPath}/${ATTEMPT_ID}`);

    expect(res.statusCode).toBe(204);
  });

  test('400 for a malformed attempt id', async () => {
    const res = await authed('delete', `${uploadsPath}/nope`);

    expect(res.statusCode).toBe(400);
    expect(videoService.cancelGameVideoUpload).not.toHaveBeenCalled();
  });

  test('404 attempt_not_found passes through', async () => {
    videoService.cancelGameVideoUpload.mockRejectedValue(
      new ApiError(404, 'Upload not found.', { reason: 'attempt_not_found' })
    );

    const res = await authed('delete', `${uploadsPath}/${ATTEMPT_ID}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.error.details).toEqual({ reason: 'attempt_not_found' });
  });
});

describe('DELETE /api/v1/games/:gameId/video', () => {
  test('200 { video: null } with no-store', async () => {
    videoService.removeGameVideo.mockResolvedValue({ video: null });

    const res = await authed('delete', `/api/v1/games/${GAME_ID}/video`);

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe(NO_STORE);
    expect(res.body).toEqual({ video: null });
    expect(videoService.removeGameVideo).toHaveBeenCalledWith({ userId: USER_ID, gameId: GAME_ID });
  });

  test('a cleanup enqueue failure surfaces as a masked 500, never success', async () => {
    videoService.removeGameVideo.mockRejectedValue(new Error('db down'));

    const res = await authed('delete', `/api/v1/games/${GAME_ID}/video`);

    expect(res.statusCode).toBe(500);
    expect(res.body.error.message).toBe('Internal server error');
  });

  test('401 without auth', async () => {
    const res = await request(createApp())
      .delete(`/api/v1/games/${GAME_ID}/video`)
      .set('Origin', ORIGIN);

    expect(res.statusCode).toBe(401);
    expect(videoService.removeGameVideo).not.toHaveBeenCalled();
  });
});
