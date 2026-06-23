import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import logger from '../logging/logger';
import {
  getPostgresConnectionTarget,
  getPostgresUri,
  validateEnv,
} from '../../config/env';

const GLOBAL_PRISMA_KEY = Symbol.for('trizendialog.prisma');
const GLOBAL_POOL_KEY = Symbol.for('trizendialog.pgPool');

type PrismaGlobalStore = typeof globalThis & {
  [GLOBAL_PRISMA_KEY]?: PrismaClient;
  [GLOBAL_POOL_KEY]?: Pool;
};

const globalStore = globalThis as PrismaGlobalStore;

let prismaEnabled = false;
let connectPromise: Promise<boolean> | null = null;

export function isPrismaConfigured(): boolean {
  return Boolean(getPostgresUri());
}

function getConnectionString(): string | null {
  return getPostgresUri() ?? null;
}

function getOrCreatePgPool(connectionString: string): Pool {
  const existing = globalStore[GLOBAL_POOL_KEY];
  if (existing) {
    return existing;
  }

  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  pool.on('error', (error) => {
    logger.error('PostgreSQL pool error', { message: error.message });
  });

  globalStore[GLOBAL_POOL_KEY] = pool;
  return pool;
}

function createPrismaClient(connectionString: string): PrismaClient {
  const pool = getOrCreatePgPool(connectionString);
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: validateEnv().NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

/** Singleton Prisma client — one instance and one pg pool per process. */
export function getPrismaClient(): PrismaClient | null {
  if (!isPrismaConfigured()) {
    return null;
  }

  const existing = globalStore[GLOBAL_PRISMA_KEY];
  if (existing) {
    return existing;
  }

  const connectionString = getConnectionString();
  if (!connectionString) {
    return null;
  }

  const client = createPrismaClient(connectionString);
  globalStore[GLOBAL_PRISMA_KEY] = client;
  prismaEnabled = true;
  logger.info('Prisma client initialized (singleton)', {
    postgresTarget: getPostgresConnectionTarget(),
  });

  return client;
}

export async function connectPrisma(): Promise<boolean> {
  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    const client = getPrismaClient();
    if (!client) {
      return false;
    }

    try {
      await client.$connect();
      await client.$queryRaw`SELECT 1`;
      logger.info('Prisma connected to PostgreSQL');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Prisma connection failed', { message });
      return false;
    }
  })();

  return connectPromise;
}

export async function disconnectPrisma(): Promise<void> {
  connectPromise = null;

  const client = globalStore[GLOBAL_PRISMA_KEY];
  const pool = globalStore[GLOBAL_POOL_KEY];

  if (client) {
    try {
      await client.$disconnect();
      logger.info('Prisma disconnected');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Prisma disconnect error', { message });
    }
  }

  if (pool) {
    try {
      await pool.end();
      logger.info('PostgreSQL pool closed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('PostgreSQL pool close error', { message });
    }
  }

  delete globalStore[GLOBAL_PRISMA_KEY];
  delete globalStore[GLOBAL_POOL_KEY];
  prismaEnabled = false;
}

export async function pingPrisma(): Promise<boolean> {
  const client = getPrismaClient();
  if (!client) {
    return false;
  }

  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export function isPrismaEnabled(): boolean {
  return prismaEnabled;
}

/** @internal Test helper — clears singleton state between tests. */
export function resetPrismaClientForTests(): void {
  connectPromise = null;
  delete globalStore[GLOBAL_PRISMA_KEY];
  delete globalStore[GLOBAL_POOL_KEY];
  prismaEnabled = false;
}
