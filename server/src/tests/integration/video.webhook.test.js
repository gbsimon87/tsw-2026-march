const crypto = require('crypto');
const request = require('supertest');
jest.mock('../../config/logger', () => ({ logger: require('pino')({ level: 'silent' }) }));
jest.mock('../../modules/video/mux.client', () => ({ isMuxConfigured: jest.fn(() => true) }));
jest.mock('../../modules/video/video.repository', () => ({
  UPLOAD_ATTEMPT_IN_FLIGHT_STATUSES: ['reserved', 'uploading', 'processing'],
  hasProcessedWebhookEvent: jest.fn(() => Promise.resolve(false)),
  findUploadAttemptByUploadId: jest.fn(() => Promise.resolve(null)),
  getVideoDeployment: jest.fn(() => 'test'),
  recordWebhookEventOnce: jest.fn(() => Promise.resolve(true)),
}));
const { env } = require('../../config/env');
const { isMuxConfigured } = require('../../modules/video/mux.client');
const { createApp } = require('../../app');
const repo = require('../../modules/video/video.repository');
const SECRET = 'test-mux-webhook-secret';
const PATH = '/api/v1/videos/webhooks/mux';
const BODY =
  '{ "id": "event", "type": "video.asset.ready", "data": { "id": "asset", "upload_id": "upload" } }';
function signature(body, timestamp = Math.floor(Date.now() / 1000)) {
  return `t=${timestamp},v1=${crypto.createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex')}`;
}
const oldSecret = env.MUX_WEBHOOK_SECRET;
beforeEach(() => {
  jest.clearAllMocks();
  env.MUX_WEBHOOK_SECRET = SECRET;
  isMuxConfigured.mockReturnValue(true);
});
afterAll(() => {
  env.MUX_WEBHOOK_SECRET = oldSecret;
});
const send = (body, sig) =>
  request(createApp())
    .post(PATH)
    .set('Content-Type', 'application/json')
    .set('Mux-Signature', sig)
    .send(body);
test('raw-body signature is verified before JSON parsing, with no browser auth or CSRF', async () => {
  const response = await send(BODY, signature(BODY));
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ received: true });
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(repo.findUploadAttemptByUploadId).toHaveBeenCalledWith('upload');
});
test('changing even whitespace invalidates the signature before ownership lookup', async () => {
  expect((await send(BODY.replace(' ', ''), signature(BODY))).status).toBe(400);
  expect(repo.findUploadAttemptByUploadId).not.toHaveBeenCalled();
});
test('expired signature is denied', async () => {
  expect((await send(BODY, signature(BODY, Math.floor(Date.now() / 1000) - 1000))).status).toBe(
    400
  );
});
test('valid signature with invalid JSON is denied without recording completion', async () => {
  expect((await send('{ broken', signature('{ broken'))).status).toBe(400);
  expect(repo.recordWebhookEventOnce).not.toHaveBeenCalled();
});
test('malformed supported event returns 400, so it is not acknowledged as processed', async () => {
  const body = JSON.stringify({ id: 'event', type: 'video.asset.ready', data: {} });
  expect((await send(body, signature(body))).status).toBe(400);
  expect(repo.recordWebhookEventOnce).not.toHaveBeenCalled();
});
test('database failure returns 500 and remains retriable', async () => {
  repo.findUploadAttemptByUploadId.mockRejectedValueOnce(new Error('db unavailable'));
  expect((await send(BODY, signature(BODY))).status).toBe(500);
  expect(repo.recordWebhookEventOnce).not.toHaveBeenCalled();
});
test('unconfigured hosting returns 503', async () => {
  isMuxConfigured.mockReturnValue(false);
  expect((await send(BODY, signature(BODY))).status).toBe(503);
});
