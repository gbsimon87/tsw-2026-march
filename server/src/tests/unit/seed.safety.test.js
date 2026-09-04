const { assertDevTarget } = require('../../scripts/seed');

const DEV_TARGET = {
  nodeEnv: 'development',
  appEnv: 'development',
  uri: 'mongodb+srv://example.mongodb.net',
  dbName: 'tsw_2026_dev',
  confirmedDbName: 'tsw_2026_dev',
};

describe('development seed target safeguards', () => {
  it('accepts only an explicitly confirmed development database', () => {
    expect(assertDevTarget(DEV_TARGET)).toEqual({
      dbName: 'tsw_2026_dev',
      redactedUri: 'mongodb+srv://example.mongodb.net',
    });
  });

  it('rejects production Node and app environments', () => {
    expect(() => assertDevTarget({ ...DEV_TARGET, nodeEnv: 'production' })).toThrow(
      'NODE_ENV is production'
    );
    expect(() => assertDevTarget({ ...DEV_TARGET, appEnv: 'production' })).toThrow(
      'APP_ENV is production'
    );
  });

  it('rejects production-looking and unrecognised database names', () => {
    expect(() =>
      assertDevTarget({
        ...DEV_TARGET,
        dbName: 'tsw_2026_prod',
        confirmedDbName: 'tsw_2026_prod',
      })
    ).toThrow('database name looks like production');
    expect(() =>
      assertDevTarget({ ...DEV_TARGET, dbName: 'tsw_2026', confirmedDbName: 'tsw_2026' })
    ).toThrow('not recognisably a dev/test database');
  });

  it('rejects a missing or mismatched explicit database confirmation', () => {
    expect(() => assertDevTarget({ ...DEV_TARGET, confirmedDbName: '' })).toThrow(
      'SEED_CONFIRM_DB is required'
    );
    expect(() => assertDevTarget({ ...DEV_TARGET, confirmedDbName: 'some_other_dev' })).toThrow(
      'does not match MONGO_DB_NAME'
    );
  });
});
