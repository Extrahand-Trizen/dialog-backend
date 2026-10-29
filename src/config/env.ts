import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

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
  /**
   * BullMQ key prefix — REQUIRED for local/dev when REDIS_URL points at a shared
   * Redis also used by deployed dialog-backend. Without isolation, remote workers
   * steal jobs and send body-only templates (Meta #132012).
   */
  BULLMQ_PREFIX: z.string().min(1).optional(),

  JWT_SECRET: z.string().min(16).optional(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ENCRYPTION_KEY: z.string().min(32).optional(),
  SERVICE_AUTH_TOKEN: z.string().min(1).optional(),

  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),

  CORS_ORIGIN: z.string().optional(),

  /** Public URL of the TrizenDialog console — optional alias; merged into CORS allowlist when set. */
  FRONTEND_URL: z.string().url().optional(),

  META_API_VERSION: z.string().default('v23.0'),
  META_APP_ID: z.string().min(1).optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  /**
   * Public HTTPS webhook URL Meta should call for message status updates.
   * When set with META_WEBHOOK_VERIFY_TOKEN, WABA subscribe uses override_callback_uri
   * so statuses are not lost if the Meta App Dashboard callback is wrong/stale.
   */
  META_WEBHOOK_CALLBACK_URL: z.string().url().optional(),

  /** mock until a white-label telecom adapter is configured. Never exposed to customers. */
  TELEPHONY_PROVIDER: z.enum(['mock']).default('mock'),
  TELEPHONY_WEBHOOK_SECRET: z.string().min(8).optional(),

  /** MinIO / S3-compatible storage for template header media previews */
  MINIO_ENDPOINT: z.string().url().optional(),
  MINIO_ACCESS_KEY: z.string().min(1).optional(),
  MINIO_SECRET_KEY: z.string().min(1).optional(),
  MINIO_BUCKET: z.string().min(1).optional(),
  /** Public base URL for browser access, e.g. https://dialog-minio-api.backend.extrahand.in/template-media */
  MINIO_PUBLIC_BASE_URL: z.string().url().optional(),
  MINIO_REGION: z.string().min(1).default('us-east-1'),

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
  })
  .superRefine((data, ctx) => {
    const hasCors =
      Boolean(data.CORS_ORIGIN?.trim()) || Boolean(data.FRONTEND_URL?.trim());

    if (data.NODE_ENV === 'production' && !hasCors) {
      ctx.addIssue({
        code: 'custom',
        message:
          'CORS_ORIGIN or FRONTEND_URL is required in production (frontend origin for browser API access)',
        path: ['CORS_ORIGIN'],
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

/** Neon + node-pg: `channel_binding=require` fails with “credentials for (not available)”. */
export function normalizePostgresConnectionString(uri: string): string {
  try {
    const parsed = new URL(uri);
    parsed.searchParams.delete('channel_binding');
    if (!parsed.searchParams.has('sslmode')) {
      parsed.searchParams.set('sslmode', 'require');
    }
    return parsed.toString();
  } catch {
    return uri.replace(/([?&])channel_binding=require&?/g, '$1').replace(/[?&]$/, '');
  }
}

/** Resolved Postgres URL — respects USE_DEV_DATABASE in non-production environments. */
export function getPostgresUri(env: Env = validateEnv()): string | undefined {
  const raw = env.USE_DEV_DATABASE ? env.POSTGRES_URI_DEV : env.POSTGRES_URI;
  return raw ? normalizePostgresConnectionString(raw) : undefined;
}

export function getPostgresConnectionTarget(env: Env = validateEnv()): PostgresConnectionTarget {
  return env.USE_DEV_DATABASE ? 'development' : 'primary';
}

export function isPostgresDevDatabaseEnabled(env: Env = validateEnv()): boolean {
  return env.USE_DEV_DATABASE;
}

export function resetEnvCacheForTests(): void {
  cachedEnv = null;
}
