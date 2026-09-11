const { assertApplyTarget, parseMigrationMode } = require('../../scripts/migrate-capacity-pricing');

describe('capacity-pricing migration safeguards', () => {
  test('requires an explicit dry-run or apply mode', () => {
    expect(() => parseMigrationMode([])).toThrow('Choose exactly one mode');
    expect(() => parseMigrationMode(['--dry-run', '--apply'])).toThrow('Choose exactly one mode');
    expect(() => parseMigrationMode(['--unknown'])).toThrow('Choose exactly one mode');
    expect(parseMigrationMode(['--dry-run'])).toBe('dry-run');
    expect(parseMigrationMode(['--apply'])).toBe('apply');
  });

  test('allows a dry run without a database confirmation', () => {
    expect(() =>
      assertApplyTarget({ mode: 'dry-run', dbName: 'tsw_2026_prod', confirmedDbName: '' })
    ).not.toThrow();
  });

  test('requires the applied database name to match exactly', () => {
    expect(() =>
      assertApplyTarget({ mode: 'apply', dbName: 'tsw_2026_prod', confirmedDbName: '' })
    ).toThrow('MIGRATION_CONFIRM_DB is required');
    expect(() =>
      assertApplyTarget({
        mode: 'apply',
        dbName: 'tsw_2026_prod',
        confirmedDbName: 'tsw_2026_dev',
      })
    ).toThrow('does not match MONGO_DB_NAME');
    expect(() =>
      assertApplyTarget({
        mode: 'apply',
        dbName: 'tsw_2026_prod',
        confirmedDbName: 'tsw_2026_prod',
      })
    ).not.toThrow();
  });
});
