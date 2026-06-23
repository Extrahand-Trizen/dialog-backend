import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4010),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  POSTGRES_URI: z.string().url().optional(),
  /** Separate dev/staging database — used only when USE_DEV_DATABASE=true (non-production). */
  POSTGRES_URI_DEV: z.string().url().optional(),
  /** When true, connects to POSTGRES_URI_DEV instead of POSTGRES_URI. Blocked in production. */
  USE_DEV_DATABASE: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  REDIS_URL: z.string().min(1).optional(),

  JWT_SECRET: z.string().min(16).optional(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ENCRYPTION_KEY: z.string().min(32).optional(),
  SERVICE_AUTH_TOKEN: z.string().min(1).optional(),

  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),

  CORS_ORIGIN: z.string().optional(),

  META_API_VERSION: z.string().default('v23.0'),
  META_APP_ID: z.string().min(1).optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),

  WHATSAPP_SEND_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(80),
  WHATSAPP_SEND_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(100).default(1000),
})
  .superRefine((data, ctx) => {
    if (!data.USE_DEV_DATABASE) {
      return;
    }

    if (data.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        message: 'USE_DEV_DATABASE cannot be enabled when NODE_ENV=production',
        path: ['USE_DEV_DATABASE'],
      });
    }

    if (!data.POSTGRES_URI_DEV) {
      ctx.addIssue({
        code: 'custom',
        message: 'POSTGRES_URI_DEV is required when USE_DEV_DATABASE=true',
        path: ['POSTGRES_URI_DEV'],
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export type PostgresConnectionTarget = 'primary' | 'development';

let cachedEnv: Env | null = null;

export function validateEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${message}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

/** Resolved Postgres URL — respects USE_DEV_DATABASE in non-production environments. */
export function getPostgresUri(env: Env = validateEnv()): string | undefined {
  if (env.USE_DEV_DATABASE) {
    return env.POSTGRES_URI_DEV;
  }
  return env.POSTGRES_URI;
}

export function getPostgresConnectionTarget(env: Env = validateEnv()): PostgresConnectionTarget {
  return env.USE_DEV_DATABASE ? 'development' : 'primary';
}

export function isPostgresDevDatabaseEnabled(env: Env = validateEnv()): boolean {
  return env.USE_DEV_DATABASE;
}

export function getCorsOrigin(env: Env): string | string[] | boolean | undefined {
  if (!env.CORS_ORIGIN) {
    return env.NODE_ENV === 'production' ? undefined : true;
  }
  return env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
}

export function resetEnvCacheForTests(): void {
  cachedEnv = null;
}
