const { createApp } = require('./app');
const { connectDb, disconnectDb } = require('./config/db');
const { env } = require('./config/env');
const { logger } = require('./config/logger');

async function bootstrap() {
  await connectDb();

  const app = createApp();
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info({ port: env.PORT }, 'API server listening');
  });

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

    try {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
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
