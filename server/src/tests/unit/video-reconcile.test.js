// pnpm --filter server video:reconcile (Task 3d, ruling E4c): one manual
// reconcile + cleanup batch; --dry-run reads only (no Mux calls, no writes).
const mockCleanup = {
  reconcileStaleAttempts: jest.fn(),
  runCleanupBatch: jest.fn(),
  previewCleanupBatch: jest.fn(),
  warnForeignVideoWork: jest.fn(() => Promise.resolve({ attempts: 0, jobs: 0 })),
};
const mockMux = { isMuxConfigured: jest.fn() };
const mockRepository = {
  countPendingCleanupJobs: jest.fn(),
  requeueFailedCleanupJobs: jest.fn(() => Promise.resolve(2)),
  getVideoDeployment: jest.fn(() => 'test:tsw_2026_test'),
};

const mockLifecycle = { reconcileVideoLifecycle: jest.fn(() => Promise.resolve({ recovered: 0 })) };
jest.mock('../../modules/video/video.lifecycle', () => mockLifecycle);
jest.mock('../../modules/video/video.cleanup', () => mockCleanup);
jest.mock('../../modules/video/mux.client', () => mockMux);
jest.mock('../../modules/video/video.repository', () => mockRepository);

const {
  parseVideoReconcileArgs,
  runVideoReconcile,
  RECONCILE_SCRIPT_LIMIT,
  CLEANUP_SCRIPT_LIMIT,
} = require('../../scripts/video-reconcile');

const NOW = new Date('2026-10-04T12:00:00.000Z');

beforeEach(() => {
  jest.clearAllMocks();
  mockMux.isMuxConfigured.mockReturnValue(true);
  mockCleanup.reconcileStaleAttempts.mockResolvedValue({ dryRun: false, reconciled: 1 });
  mockCleanup.runCleanupBatch.mockResolvedValue({ claimed: 2, done: 2 });
  mockCleanup.previewCleanupBatch.mockResolvedValue([{ jobId: 'j1', kind: 'delete_asset' }]);
  mockRepository.countPendingCleanupJobs.mockImplementation(async ({ includeFailed } = {}) =>
    includeFailed ? 5 : 3
  );
});

describe('parseVideoReconcileArgs', () => {
  test('defaults to a live run; --dry-run reads only', () => {
    expect(parseVideoReconcileArgs([])).toEqual({ dryRun: false, retryFailed: false });
    expect(parseVideoReconcileArgs(['--dry-run'])).toEqual({ dryRun: true, retryFailed: false });
  });

  test('ignores the bare "--" pnpm 10 forwards from `pnpm video:reconcile -- --dry-run`', () => {
    expect(parseVideoReconcileArgs(['--', '--dry-run'])).toEqual({
      dryRun: true,
      retryFailed: false,
    });
  });

  test('--retry-failed requeues failed cleanup jobs', () => {
    expect(parseVideoReconcileArgs(['--', '--retry-failed'])).toEqual({
      dryRun: false,
      retryFailed: true,
    });
  });

  test.each([['--force'], ['64b7f0c2a1b2c3d4e5f60718']])('rejects %s', (argument) => {
    expect(() => parseVideoReconcileArgs([argument])).toThrow(/Unknown argument/);
  });
});

describe('runVideoReconcile', () => {
  test('live: reconcile (bounded), then one cleanup batch, then the outstanding counts', async () => {
    const summary = await runVideoReconcile({ dryRun: false, now: NOW });

    expect(mockCleanup.reconcileStaleAttempts).toHaveBeenCalledWith({
      now: NOW,
      limit: RECONCILE_SCRIPT_LIMIT,
      dryRun: false,
    });
    expect(mockCleanup.runCleanupBatch).toHaveBeenCalledWith({ limit: CLEANUP_SCRIPT_LIMIT });
    expect(mockCleanup.reconcileStaleAttempts.mock.invocationCallOrder[0]).toBeLessThan(
      mockCleanup.runCleanupBatch.mock.invocationCallOrder[0]
    );
    expect(mockCleanup.previewCleanupBatch).not.toHaveBeenCalled();
    expect(summary).toEqual({
      deployment: 'test:tsw_2026_test',
      dryRun: false,
      reconcile: { dryRun: false, reconciled: 1 },
      lifecycle: { recovered: 0 },
      cleanup: { claimed: 2, done: 2 },
      outstanding: { pending: 3, failed: 2 },
      foreignDeployments: { attempts: 0, jobs: 0 },
    });
  });

  test('dry run: reconcile in dry-run mode and a preview — never the cleanup batch (no Mux calls, no writes)', async () => {
    const summary = await runVideoReconcile({ dryRun: true, now: NOW });

    expect(mockCleanup.reconcileStaleAttempts).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true })
    );
    expect(mockCleanup.runCleanupBatch).not.toHaveBeenCalled();
    expect(mockCleanup.previewCleanupBatch).toHaveBeenCalledWith({
      now: NOW,
      limit: CLEANUP_SCRIPT_LIMIT,
    });
    expect(summary.cleanup).toEqual({
      dryRun: true,
      wouldProcess: [{ jobId: 'j1', kind: 'delete_asset' }],
    });
  });

  test('--retry-failed requeues failed jobs before the cleanup batch (V4)', async () => {
    const summary = await runVideoReconcile({ dryRun: false, retryFailed: true, now: NOW });

    expect(mockRepository.requeueFailedCleanupJobs).toHaveBeenCalledWith({ now: NOW });
    expect(mockRepository.requeueFailedCleanupJobs.mock.invocationCallOrder[0]).toBeLessThan(
      mockCleanup.runCleanupBatch.mock.invocationCallOrder[0]
    );
    expect(summary.requeuedFailed).toBe(2);
  });

  test('without --retry-failed, or in a dry run, failed jobs are left alone', async () => {
    const live = await runVideoReconcile({ dryRun: false, now: NOW });
    const dry = await runVideoReconcile({ dryRun: true, retryFailed: true, now: NOW });

    expect(mockRepository.requeueFailedCleanupJobs).not.toHaveBeenCalled();
    expect(live.requeuedFailed).toBeUndefined();
    expect(dry.requeuedFailed).toEqual({ dryRun: true, wouldRequeue: 2 });
  });

  test('dry run works without Mux credentials', async () => {
    mockMux.isMuxConfigured.mockReturnValue(false);
    await expect(runVideoReconcile({ dryRun: true, now: NOW })).resolves.toMatchObject({
      dryRun: true,
    });
  });

  test('live run refuses up front when Mux is not configured — nothing is changed', async () => {
    mockMux.isMuxConfigured.mockReturnValue(false);

    await expect(runVideoReconcile({ dryRun: false, now: NOW })).rejects.toThrow(
      /Mux is not configured/
    );
    expect(mockCleanup.reconcileStaleAttempts).not.toHaveBeenCalled();
    expect(mockCleanup.runCleanupBatch).not.toHaveBeenCalled();
  });
});
