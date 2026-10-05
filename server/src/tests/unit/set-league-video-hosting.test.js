const {
  parseVideoHostingArgs,
  planVideoHostingUpdate,
} = require('../../scripts/set-league-video-hosting');

const LEAGUE_ID = '64b7f0c2a1b2c3d4e5f60719';
const OPERATOR_ID = '64b7f0c2a1b2c3d4e5f6071a';
const NOW = new Date('2026-10-04T12:00:00.000Z');

const DEFAULTS = {
  enabled: false,
  maxStoredMinutes: 0,
  maxConcurrentUploads: 1,
  maxCreatesPerDay: 3,
  publicClips: { status: 'unrecorded', updatedAt: null, updatedBy: null },
};

describe('parseVideoHostingArgs', () => {
  test('parses a league id, toggles, limits and the footage grant', () => {
    expect(
      parseVideoHostingArgs([
        LEAGUE_ID,
        '--enable',
        '--max-stored-minutes',
        '600',
        '--max-concurrent-uploads=2',
        '--max-creates-per-day',
        '5',
        '--public-clips',
        'granted',
        '--by',
        'Ops@Example.com',
        '--dry-run',
      ])
    ).toEqual({
      leagueId: LEAGUE_ID,
      dryRun: true,
      by: 'ops@example.com',
      changes: {
        enabled: true,
        maxStoredMinutes: 600,
        maxConcurrentUploads: 2,
        maxCreatesPerDay: 5,
        publicClipsStatus: 'granted',
      },
    });
  });

  test('no change flags means "show the current grant"', () => {
    expect(parseVideoHostingArgs([LEAGUE_ID])).toEqual({
      leagueId: LEAGUE_ID,
      dryRun: false,
      by: null,
      changes: {},
    });
    expect(parseVideoHostingArgs([LEAGUE_ID, '--disable']).changes).toEqual({ enabled: false });
  });

  test.each([
    [[], /league id/],
    [['not-an-id'], /league id/],
    [[LEAGUE_ID, '--enable', '--disable'], /--enable or --disable/],
    [[LEAGUE_ID, '--max-stored-minutes', '-1'], /--max-stored-minutes/],
    [[LEAGUE_ID, '--max-stored-minutes', '1.5'], /--max-stored-minutes/],
    [[LEAGUE_ID, '--max-creates-per-day'], /--max-creates-per-day/],
    [[LEAGUE_ID, '--public-clips', 'maybe'], /--public-clips/],
    [[LEAGUE_ID, '--public-clips', 'granted'], /--by/],
    [[LEAGUE_ID, '--revoke'], /Unknown argument/],
  ])('rejects %j', (argv, message) => {
    expect(() => parseVideoHostingArgs(argv)).toThrow(message);
  });
});

describe('planVideoHostingUpdate', () => {
  test('merges changes over the current grant and lists what changed', () => {
    const { next, changed } = planVideoHostingUpdate(
      DEFAULTS,
      { enabled: true, maxStoredMinutes: 600 },
      { now: NOW }
    );
    expect(next).toEqual({ ...DEFAULTS, enabled: true, maxStoredMinutes: 600 });
    expect(changed).toEqual(['enabled', 'maxStoredMinutes']);
  });

  test('is idempotent: re-applying the same values changes nothing', () => {
    const current = { ...DEFAULTS, enabled: true, maxStoredMinutes: 600 };
    expect(
      planVideoHostingUpdate(current, { enabled: true, maxStoredMinutes: 600 }, { now: NOW })
        .changed
    ).toEqual([]);
  });

  test('records who changed the footage grant and when — only when the status changes', () => {
    const granted = planVideoHostingUpdate(
      DEFAULTS,
      { publicClipsStatus: 'granted' },
      { operatorUserId: OPERATOR_ID, now: NOW }
    );
    expect(granted.next.publicClips).toEqual({
      status: 'granted',
      updatedAt: NOW,
      updatedBy: OPERATOR_ID,
    });
    expect(granted.changed).toEqual(['publicClips']);

    const again = planVideoHostingUpdate(
      granted.next,
      { publicClipsStatus: 'granted' },
      { operatorUserId: OPERATOR_ID, now: new Date() }
    );
    expect(again.changed).toEqual([]);
    expect(again.next.publicClips.updatedAt).toBe(NOW);
  });

  test('a footage-grant change needs an operator', () => {
    expect(() =>
      planVideoHostingUpdate(DEFAULTS, { publicClipsStatus: 'withdrawn' }, { now: NOW })
    ).toThrow(/operator/);
  });

  test('a league without a stored grant starts from the closed defaults', () => {
    expect(planVideoHostingUpdate(undefined, {}, { now: NOW })).toEqual({
      next: DEFAULTS,
      changed: [],
    });
  });
});

describe('V20 operator safety', () => {
  test('a bare `--` from pnpm script forwarding is ignored', () => {
    expect(parseVideoHostingArgs(['--', LEAGUE_ID, '--enable']).leagueId).toBe(LEAGUE_ID);
  });

  test('enabled hosting below one 180-minute reservation is rejected', () => {
    expect(() => planVideoHostingUpdate(null, { enabled: true, maxStoredMinutes: 120 })).toThrow(
      /at least 180/
    );
    expect(() =>
      planVideoHostingUpdate(
        { ...DEFAULTS, enabled: true, maxStoredMinutes: 600 },
        {
          maxStoredMinutes: 60,
        }
      )
    ).toThrow(/at least 180/);
  });

  test('a disabled grant may keep any limit', () => {
    expect(planVideoHostingUpdate(null, { maxStoredMinutes: 60 }).next.maxStoredMinutes).toBe(60);
  });

  test('describeTarget names the database without credentials', () => {
    const { describeTarget } = require('../../scripts/set-league-video-hosting');
    expect(describeTarget({ name: 'tsw_prod', host: 'cluster0.example.net' })).toBe(
      'database tsw_prod on cluster0.example.net'
    );
  });
});
