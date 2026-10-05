const { createApp } = require('./app');
const { connectDb, disconnectDb } = require('./config/db');
const { env } = require('./config/env');
const { logger } = require('./config/logger');
const { shutdownAnalytics } = require('./modules/analytics/analytics.service');
const { isMuxConfigured } = require('./modules/video/mux.client');
const {
  startVideoCleanupSweep,
  stopVideoCleanupSweep,
  waitForCleanupKicks,
} = require('./modules/video/video.cleanup');
const { enforceVideoUploadPrerequisites } = require('./modules/video/video.prerequisites');

async function bootstrap() {
  await connectDb();
  // V23: replica set + video indexes, before any upload request is served.
  await enforceVideoUploadPrerequisites();

  const app = createApp();
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info({ port: env.PORT }, 'API server listening');
  });

  // Mux game video (ruling E4): durable provider cleanup + stale-upload
  // reconciliation on a bounded, lease-claimed, unref'd interval. Started
  // here only — never from app.js, which tests load.
  if (isMuxConfigured()) {
    startVideoCleanupSweep();
    logger.info('Video cleanup sweep started');
  }

  registerGracefulShutdown(server);
}

// OPT-023: drain connections and close the DB pool on SIGTERM/SIGINT so a
// rolling deploy (or Ctrl-C in dev) stops accepting new requests, lets in-flight
// ones finish, then exits cleanly instead of dropping live requests. A hard
// timeout guards against a hung connection keeping the process alive forever.
function registerGracefulShutdown(server) {
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Received shutdown signal; draining');

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, 10000);
    forceExit.unref();

    // No new video cleanup sweep ticks while draining; an in-flight run
    // finishes its current job (claiming no more) before the DB closes. An
    // interrupted job's lease expires and it is claimed again after restart.
    const videoSweepStopped = stopVideoCleanupSweep();

    try {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await videoSweepStopped;
      // V23: requests drained by close may have kicked cleanup batches.
      await waitForCleanupKicks();
      // Flush batched analytics before the process goes away, otherwise a
      // restart or deploy silently discards whatever is still queued.
      await shutdownAnalytics();
      await disconnectDb();
      clearTimeout(forceExit);
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  logger.error({ err: error }, 'Failed to start server');
  process.exit(1);
});
