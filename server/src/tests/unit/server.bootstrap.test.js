// server.js wiring for the Mux video cleanup sweep (Task 3d, ruling E4): the
// sweep starts only when Mux is configured and is stopped (and awaited) during
// graceful shutdown, before the DB pool closes. app.js stays side-effect free;
// server.js is only ever loaded here, with every dependency mocked.
jest.mock('../../config/db', () => ({
  connectDb: jest.fn().mockResolvedValue(),
  disconnectDb: jest.fn().mockResolvedValue(),
}));
jest.mock('../../app', () => ({ createApp: jest.fn() }));
jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../modules/analytics/analytics.service', () => ({
  shutdownAnalytics: jest.fn().mockResolvedValue(),
}));
jest.mock('../../modules/video/mux.client', () => ({ isMuxConfigured: jest.fn() }));
jest.mock('../../modules/video/video.cleanup', () => ({
  startVideoCleanupSweep: jest.fn(() => true),
  stopVideoCleanupSweep: jest.fn().mockResolvedValue(),
}));

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

function loadServer({ muxConfigured }) {
  const handlers = {};
  jest.spyOn(process, 'on').mockImplementation((event, handler) => {
    handlers[event] = handler;
    return process;
  });
  const exit = jest.spyOn(process, 'exit').mockImplementation(() => {});

  let modules;
  jest.isolateModules(() => {
    modules = {
      db: require('../../config/db'),
      app: require('../../app'),
      mux: require('../../modules/video/mux.client'),
      cleanup: require('../../modules/video/video.cleanup'),
    };
    modules.mux.isMuxConfigured.mockReturnValue(muxConfigured);
    const httpServer = { close: jest.fn((callback) => callback()) };
    modules.app.createApp.mockReturnValue({
      listen: jest.fn((_port, _host, callback) => {
        callback();
        return httpServer;
      }),
    });
    require('../../server');
  });
  return { ...modules, handlers, exit };
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('does not start the video cleanup sweep when Mux is not configured', async () => {
  const { cleanup } = loadServer({ muxConfigured: false });
  await flushPromises();

  expect(cleanup.startVideoCleanupSweep).not.toHaveBeenCalled();
});

test('starts the sweep when Mux is configured and stops it on shutdown before closing the DB', async () => {
  const { cleanup, db, handlers, exit } = loadServer({ muxConfigured: true });
  await flushPromises();

  expect(cleanup.startVideoCleanupSweep).toHaveBeenCalledTimes(1);

  handlers.SIGTERM();
  await flushPromises();
  await flushPromises();

  expect(cleanup.stopVideoCleanupSweep).toHaveBeenCalledTimes(1);
  expect(cleanup.stopVideoCleanupSweep.mock.invocationCallOrder[0]).toBeLessThan(
    db.disconnectDb.mock.invocationCallOrder[0]
  );
  expect(exit).toHaveBeenCalledWith(0);
});
