const { createApp } = require('./app');
const { connectDb } = require('./config/db');
const { env } = require('./config/env');
const { logger } = require('./config/logger');

async function bootstrap() {
  await connectDb();

  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'API server listening');
  });
}

bootstrap().catch((error) => {
  logger.error({ err: error }, 'Failed to start server');
  process.exit(1);
});
