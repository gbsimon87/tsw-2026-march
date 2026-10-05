// V23: hosted uploads need a replica set (settlement transactions) and the
// video unique indexes (atomic quota/ownership). Checked at boot.
const { checkVideoUploadPrerequisites } = require('../../modules/video/video.prerequisites');

function model(name, schemaIndexes, existing) {
  return {
    modelName: name,
    schema: { indexes: () => schemaIndexes },
    collection: {
      indexes: jest.fn(async () => {
        if (existing === null) throw Object.assign(new Error('ns does not exist'), { code: 26 });
        return [{ key: { _id: 1 } }, ...existing.map((key) => ({ key }))];
      }),
    },
  };
}

const db = (hello) => ({ admin: () => ({ command: jest.fn(async () => hello) }) });

test('a replica set with every declared index passes', async () => {
  const result = await checkVideoUploadPrerequisites({
    db: db({ setName: 'rs0' }),
    models: [
      model(
        'VideoQuotaCounter',
        [[{ resource: 1, day: 1 }, { unique: true }]],
        [{ resource: 1, day: 1 }]
      ),
    ],
  });
  expect(result).toEqual({ ok: true, problems: [] });
});

test('a sharded cluster (mongos) counts as transaction-capable', async () => {
  const result = await checkVideoUploadPrerequisites({ db: db({ msg: 'isdbgrid' }), models: [] });
  expect(result.ok).toBe(true);
});

test('a standalone server and a missing index are both reported', async () => {
  const result = await checkVideoUploadPrerequisites({
    db: db({ isWritablePrimary: true }),
    models: [
      model('VideoQuotaCounter', [[{ resource: 1, day: 1 }, { unique: true }]], []),
      model('VideoCleanupJob', [[{ kind: 1, targetId: 1 }, {}]], null),
    ],
  });
  expect(result.ok).toBe(false);
  expect(result.problems).toEqual([
    'MongoDB is not a replica set (transactions unavailable)',
    'VideoQuotaCounter index {"resource":1,"day":1} is missing',
    'VideoCleanupJob index {"kind":1,"targetId":1} is missing',
  ]);
});

describe('enforceVideoUploadPrerequisites', () => {
  const { enforceVideoUploadPrerequisites } = require('../../modules/video/video.prerequisites');
  const logger = () => ({ error: jest.fn(), info: jest.fn() });

  test('does nothing while uploads are off', async () => {
    const env = { MUX_UPLOADS_ENABLED: false };
    const check = jest.fn();
    await enforceVideoUploadPrerequisites({ env, logger: logger(), check });
    expect(check).not.toHaveBeenCalled();
  });

  test('a failed check turns uploads off and logs the problems', async () => {
    const env = { MUX_UPLOADS_ENABLED: true };
    const log = logger();
    await enforceVideoUploadPrerequisites({
      env,
      logger: log,
      check: async () => ({ ok: false, problems: ['missing index'] }),
    });
    expect(env.MUX_UPLOADS_ENABLED).toBe(false);
    expect(log.error).toHaveBeenCalledWith(
      { problems: ['missing index'] },
      expect.stringContaining('Hosted video uploads disabled')
    );
  });

  test('a check that throws fails closed too', async () => {
    const env = { MUX_UPLOADS_ENABLED: true };
    await enforceVideoUploadPrerequisites({
      env,
      logger: logger(),
      check: async () => {
        throw new Error('not authorized');
      },
    });
    expect(env.MUX_UPLOADS_ENABLED).toBe(false);
  });

  test('a passing check keeps uploads on', async () => {
    const env = { MUX_UPLOADS_ENABLED: true };
    await enforceVideoUploadPrerequisites({
      env,
      logger: logger(),
      check: async () => ({ ok: true, problems: [] }),
    });
    expect(env.MUX_UPLOADS_ENABLED).toBe(true);
  });
});
