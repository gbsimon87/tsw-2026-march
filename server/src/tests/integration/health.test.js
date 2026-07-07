const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('../../app');

// OPT-023: the health check now pings Mongo, so these tests drive the
// connection state directly. There is no live DB in the unit/integration
// environment — `readyState` and `db.admin().ping` are stubbed per case.
describe('GET /api/v1/health', () => {
  let originalReadyState;
  let originalDb;

  beforeEach(() => {
    originalReadyState = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
    originalDb = mongoose.connection.db;
  });

  function setConnection({ readyState, ping }) {
    Object.defineProperty(mongoose.connection, 'readyState', {
      value: readyState,
      configurable: true,
    });
    if (ping) {
      mongoose.connection.db = { admin: () => ({ ping }) };
    }
  }

  afterEach(() => {
    if (originalReadyState) {
      Object.defineProperty(mongoose.connection, 'readyState', originalReadyState);
    }
    mongoose.connection.db = originalDb;
    jest.restoreAllMocks();
  });

  test('responds 200 with db ok when connected and the ping succeeds', async () => {
    setConnection({ readyState: 1, ping: jest.fn().mockResolvedValue({ ok: 1 }) });

    const response = await request(createApp()).get('/api/v1/health');

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.db).toBe('ok');
  });

  test('responds 503 when the DB connection is not established', async () => {
    setConnection({ readyState: 0 });

    const response = await request(createApp()).get('/api/v1/health');

    expect(response.statusCode).toBe(503);
    expect(response.body.status).toBe('unavailable');
    expect(response.body.db).toBe('disconnected');
  });

  test('responds 503 when the DB ping throws', async () => {
    setConnection({
      readyState: 1,
      ping: jest.fn().mockRejectedValue(new Error('no primary')),
    });

    const response = await request(createApp()).get('/api/v1/health');

    expect(response.statusCode).toBe(503);
    expect(response.body.status).toBe('unavailable');
    expect(response.body.db).toBe('error');
  });
});
