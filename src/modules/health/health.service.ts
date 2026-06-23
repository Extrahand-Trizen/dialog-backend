import {
  getPostgresConnectionTarget,
  isPostgresDevDatabaseEnabled,
  validateEnv,
} from '../../config/env';
import { getCorsOrigins, isCorsConfigured } from '../../config/cors';
import {
  isPrismaConfigured,
  pingPrisma,
} from '../../infrastructure/prisma/client';
import {
  isRedisConfigured,
  pingRedis,
} from '../../infrastructure/redis/client';
import { isEncryptionConfigured } from '../../infrastructure/encryption/fieldCrypto';
import type { DependencyStatus, HealthCheckDto, ReadinessCheckDto } from './health.types';

const SERVICE_VERSION = '0.1.0';

export function getLiveness(): HealthCheckDto {
  const env = validateEnv();
  return {
    service: 'trizendialog-backend',
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    version: SERVICE_VERSION,
  };
}

export async function getReadiness(): Promise<ReadinessCheckDto> {
  const postgres = await checkPostgres();
  const redis = await checkRedis();
  const queues = checkQueues(redis);

  const status = [postgres, redis, queues].every((check) => check !== 'down')
    ? 'ready'
    : 'not_ready';

  return {
    service: 'trizendialog-backend',
    status,
    timestamp: new Date().toISOString(),
    checks: {
      postgres,
      redis,
      queues,
    },
  };
}

export function getConfigSummary(): Record<string, boolean | string | number> {
  const corsOrigins = getCorsOrigins();
  return {
    postgresConfigured: isPrismaConfigured(),
    postgresTarget: getPostgresConnectionTarget(),
    postgresDevDatabaseEnabled: isPostgresDevDatabaseEnabled(),
    corsConfigured: isCorsConfigured(),
    corsOriginCount: corsOrigins.length,
    redisConfigured: isRedisConfigured(),
    encryptionConfigured: isEncryptionConfigured(),
  };
}
async function checkPostgres(): Promise<DependencyStatus> {
  if (!isPrismaConfigured()) {
    return 'not_configured';
  }
  return (await pingPrisma()) ? 'up' : 'down';
}

async function checkRedis(): Promise<DependencyStatus> {
  if (!isRedisConfigured()) {
    return 'not_configured';
  }
  return (await pingRedis()) ? 'up' : 'down';
}

function checkQueues(redisStatus: DependencyStatus): DependencyStatus {
  if (redisStatus === 'not_configured') {
    return 'not_configured';
  }
  return redisStatus === 'up' ? 'up' : 'down';
}
