import { createApp } from './app';
import { getPostgresConnectionTarget, getPostgresUri, validateEnv } from './config/env';
import logger from './infrastructure/logging/logger';
import { connectPrisma, disconnectPrisma } from './infrastructure/prisma/client';
import { connectRedis, disconnectRedis } from './infrastructure/redis/client';
import { registerTemplateEventHandlers } from './modules/templates';
import { startWorkers, stopWorkers } from './workers';

async function startServer(): Promise<void> {
  const env = validateEnv();
  logger.info('Starting TrizenDialog backend', {
    nodeEnv: env.NODE_ENV,
    postgresTarget: getPostgresConnectionTarget(),
  });

  registerTemplateEventHandlers();

  const postgresConnected = await connectPrisma();
  if (getPostgresUri() && !postgresConnected) {
    logger.warn('PostgreSQL configured but not reachable — readiness will report degraded');
  }

  const redisConnected = await connectRedis();
  if (env.REDIS_URL && !redisConnected) {
    logger.warn('Redis configured but not reachable — readiness will report degraded');
  }

  if (redisConnected) {
    startWorkers();
  }

  const app = createApp();
  const port = env.PORT;

  const server = app.listen(port, '0.0.0.0', () => {
    logger.info('TrizenDialog backend listening', {
      port,
      health: `http://localhost:${port}/api/v1/health`,
      readiness: `http://localhost:${port}/api/v1/health/ready`,
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('Shutdown signal received', { signal });
    server.close(async () => {
      await stopWorkers();
      await disconnectRedis();
      await disconnectPrisma();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

startServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  logger.error('Failed to start server', { message });
  process.exit(1);
});
