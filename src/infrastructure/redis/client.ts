import Redis from 'ioredis';
import logger from '../logging/logger';
import { validateEnv } from '../../config/env';
import {
  canAttemptRedis,
  isRedisCircuitOpen,
  recordRedisFailure,
  recordRedisSuccess,
} from './redisCircuitBreaker';

let redisClient: Redis | null = null;

export function isRedisConfigured(): boolean {
  return Boolean(validateEnv().REDIS_URL);
}

function createRedisClient(url: string): Redis {
  const client = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: (times) => {
      if (!canAttemptRedis()) {
        return null;
      }
      return Math.min(times * 500, 10_000);
    },
  });

  client.on('error', (error) => {
    recordRedisFailure(error);

    if (isRedisCircuitOpen() && redisClient === client) {
      void teardownRedisClient();
    }
  });

  client.on('ready', () => {
    recordRedisSuccess();
  });

  return client;
}

async function teardownRedisClient(): Promise<void> {
  if (!redisClient) {
    return;
  }

  const client = redisClient;
  redisClient = null;

  try {
    client.disconnect();
  } catch {
    // ignore — client may already be closed
  }
}

export function getRedisClient(): Redis | null {
  if (!isRedisConfigured() || !canAttemptRedis()) {
    return null;
  }

  const url = validateEnv().REDIS_URL;
  if (!url) {
    return null;
  }

  if (!redisClient) {
    redisClient = createRedisClient(url);
  }

  return redisClient;
}

export async function connectRedis(): Promise<boolean> {
  if (!canAttemptRedis()) {
    return false;
  }

  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    if (client.status === 'wait') {
      await client.connect();
    }
    const pong = await client.ping();
    const connected = pong === 'PONG';
    if (connected) {
      recordRedisSuccess();
      logger.info('Redis connected', { pong });
    }
    return connected;
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    recordRedisFailure(err);
    logger.error('Redis connection failed', { message: err.message });
    await teardownRedisClient();
    return false;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!redisClient) {
    return;
  }

  try {
    await redisClient.quit();
    logger.info('Redis disconnected');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Redis disconnect error', { message });
  } finally {
    redisClient = null;
  }
}

export async function pingRedis(): Promise<boolean> {
  if (!canAttemptRedis()) {
    return false;
  }

  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    if (client.status === 'wait') {
      await client.connect();
    }
    const pong = await client.ping();
    const ok = pong === 'PONG';
    if (ok) {
      recordRedisSuccess();
    }
    return ok;
  } catch (error) {
    recordRedisFailure(error instanceof Error ? error : new Error('Redis ping failed'));
    await teardownRedisClient();
    return false;
  }
}
