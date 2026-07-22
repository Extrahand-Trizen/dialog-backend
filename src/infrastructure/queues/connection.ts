import type { ConnectionOptions } from 'bullmq';
import { validateEnv } from '../../config/env';
import logger from '../logging/logger';

let loggedPrefix = false;

export function isQueueInfrastructureConfigured(): boolean {
  return Boolean(validateEnv().REDIS_URL);
}

export function getQueueConnection(): ConnectionOptions {
  const url = validateEnv().REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is not configured');
  }

  return {
    url,
    maxRetriesPerRequest: null,
  };
}

/** BullMQ Redis key prefix so local/dev does not share queues with production. */
export function getBullMqPrefix(): string | undefined {
  const prefix = validateEnv().BULLMQ_PREFIX?.trim();
  return prefix || undefined;
}

export function getQueueWorkerOptions(): {
  connection: ConnectionOptions;
  prefix?: string;
} {
  const prefix = getBullMqPrefix();
  if (prefix && !loggedPrefix) {
    loggedPrefix = true;
    logger.info('BullMQ queue prefix enabled (isolates this process from other dialog workers)', {
      prefix,
    });
  }
  if (!prefix && validateEnv().NODE_ENV === 'development') {
    if (!loggedPrefix) {
      loggedPrefix = true;
      logger.warn(
        'BULLMQ_PREFIX is not set — this process shares Redis queues with any other dialog-backend using the same REDIS_URL. Set BULLMQ_PREFIX=dialog-local in .env for local testing.',
      );
    }
  }

  return {
    connection: getQueueConnection(),
    ...(prefix ? { prefix } : {}),
  };
}
