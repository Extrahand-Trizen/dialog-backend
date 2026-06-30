import type { CorsOptions } from 'cors';
import logger from '../infrastructure/logging/logger';
import { type Env, validateEnv } from './env';

/** Comma-separated `CORS_ORIGIN` + optional `FRONTEND_URL` parsed at runtime. */
export function getCorsOrigins(env: Env = validateEnv()): string[] {
  const origins = new Set<string>();

  if (env.CORS_ORIGIN?.trim()) {
    for (const origin of env.CORS_ORIGIN.split(',')) {
      const trimmed = origin.trim();
      if (trimmed) {
        origins.add(trimmed);
      }
    }
  }

  if (env.FRONTEND_URL?.trim()) {
    origins.add(env.FRONTEND_URL.trim());
  }

  return [...origins];
}

export function isCorsConfigured(env: Env = validateEnv()): boolean {
  return getCorsOrigins(env).length > 0;
}

export function createCorsOptions(env: Env = validateEnv()): CorsOptions {
  const allowedOrigins = getCorsOrigins(env);

  if (allowedOrigins.length === 0) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'CORS_ORIGIN is required in production — set the TrizenDialog frontend URL(s), comma-separated',
      );
    }

    return {
      origin: true,
      credentials: true,
    };
  }

  const allowedSet = new Set(allowedOrigins);

  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedSet.has(origin)) {
        callback(null, true);
        return;
      }

      logger.warn('CORS request blocked', {
        origin,
        allowedOrigins,
      });
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  };
}
