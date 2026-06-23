import type { ConnectionOptions } from 'bullmq';
import { validateEnv } from '../../config/env';

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
