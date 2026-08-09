const request = require('supertest');

jest.mock('../../modules/leagues/dataCompleteness.service', () => ({
  getDataCompletenessForUser: jest.fn(),
  dismissIssueForUser: jest.fn(),
  restoreIssueForUser: jest.fn(),
}));

const dataCompletenessService = require('../../modules/leagues/dataCompleteness.service');
const { ApiError } = require('../../utils/apiError');
const { createApp } = require('../../app');
const { signAccessToken } = require('../../services/token.service');

const CSRF_ORIGIN = 'http://localhost:5173';
const LEAGUE_ID = '507f1f77bcf86cd799439011';

function authedGet(app, path, userId = 'owner-1') {
  return request(app)
    .get(path)
    .set('Authorization', `Bearer ${signAccessToken({ sub: userId, sid: 'session-1' })}`);
}

function authedPost(app, path, userId = 'owner-1') {
  return request(app)
    .post(path)
    .set('Authorization', `Bearer ${signAccessToken({ sub: userId, sid: 'session-1' })}`)
    .set('Origin', CSRF_ORIGIN);
}

function authedDelete(app, path, userId = 'owner-1') {
  return request(app)
    .delete(path)
    .set('Authorization', `Bearer ${signAccessToken({ sub: userId, sid: 'session-1' })}`)
    .set('Origin', CSRF_ORIGIN);
}

describe('data completeness routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the report', async () => {
    dataCompletenessService.getDataCompletenessForUser.mockResolvedValue({
      seasonId: '507f1f77bcf86cd799439021',
      seasonName: 'Spring 2026',
      generatedAt: '2026-08-09T12:00:00.000Z',
      counts: { high: 1, medium: 0, low: 0, dismissed: 0 },
      categories: [],
    });

    const app = createApp();
    const response = await authedGet(app, `/api/v1/leagues/${LEAGUE_ID}/data-completeness`);

    expect(response.status).toBe(200);
    expect(response.body.seasonName).toBe('Spring 2026');
    expect(dataCompletenessService.getDataCompletenessForUser).toHaveBeenCalledWith(
      'owner-1',
      LEAGUE_ID
    );
  });

  it('dismisses an issue', async () => {
    dataCompletenessService.dismissIssueForUser.mockResolvedValue({
      issueKey: 'no_logo:507f1f77bcf86cd799439031',
      dismissed: true,
    });

    const app = createApp();
    const response = await authedPost(
      app,
      `/api/v1/leagues/${LEAGUE_ID}/data-completeness/dismissals`
    ).send({ issueKey: 'no_logo:507f1f77bcf86cd799439031' });

    expect(response.status).toBe(201);
    expect(response.body.dismissed).toBe(true);
  });

  it('rejects a malformed issue key with 400', async () => {
    const app = createApp();
    const response = await authedPost(
      app,
      `/api/v1/leagues/${LEAGUE_ID}/data-completeness/dismissals`
    ).send({ issueKey: 'nope' });

    expect(response.status).toBe(400);
    expect(dataCompletenessService.dismissIssueForUser).not.toHaveBeenCalled();
  });

  it('restores a dismissed issue', async () => {
    dataCompletenessService.restoreIssueForUser.mockResolvedValue({
      issueKey: 'no_logo:507f1f77bcf86cd799439031',
      dismissed: false,
    });

    const app = createApp();
    const response = await authedDelete(
      app,
      `/api/v1/leagues/${LEAGUE_ID}/data-completeness/dismissals/no_logo:507f1f77bcf86cd799439031`
    );

    expect(response.status).toBe(200);
    expect(response.body.dismissed).toBe(false);
    expect(dataCompletenessService.restoreIssueForUser).toHaveBeenCalledWith(
      'owner-1',
      LEAGUE_ID,
      'no_logo:507f1f77bcf86cd799439031'
    );
  });

  it('propagates a service 403', async () => {
    dataCompletenessService.getDataCompletenessForUser.mockRejectedValue(
      new ApiError(403, 'Forbidden')
    );

    const app = createApp();
    const response = await authedGet(app, `/api/v1/leagues/${LEAGUE_ID}/data-completeness`);

    expect(response.status).toBe(403);
  });

  it('requires auth', async () => {
    const app = createApp();
    const response = await request(app).get(`/api/v1/leagues/${LEAGUE_ID}/data-completeness`);

    expect(response.status).toBe(401);
    expect(dataCompletenessService.getDataCompletenessForUser).not.toHaveBeenCalled();
  });
});
