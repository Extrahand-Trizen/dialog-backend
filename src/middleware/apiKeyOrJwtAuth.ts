import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../shared/errors/AppError';
import { verifyAccessToken } from '../infrastructure/auth/jwt';
import { resolveApiKey } from '../modules/apiKeys/apiKeys.service';

const API_KEY_PREFIX = 'tdk_live_';

function extractCredential(req: Request): { token: string; preferApiKey: boolean } | null {
  const xApiKey = typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : undefined;
  if (xApiKey) {
    return { token: xApiKey, preferApiKey: true };
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    return { token, preferApiKey: token.startsWith(API_KEY_PREFIX) };
  }

  return null;
}

/** Accepts either an organization API key or a user JWT. */
export function apiKeyOrJwtAuth(req: Request, _res: Response, next: NextFunction): void {
  const credential = extractCredential(req);
  if (!credential) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }

  if (credential.preferApiKey) {
    void resolveApiKey(credential.token)
      .then((resolved) => {
        req.auth = {
          type: 'apiKey',
          apiKeyId: resolved.apiKeyId,
          organizationId: resolved.organizationId,
          scopes: resolved.scopes,
        };
        next();
      })
      .catch(next);
    return;
  }

  try {
    const payload = verifyAccessToken(credential.token);
    req.auth = {
      type: 'jwt',
      userId: payload.sub,
      email: payload.email,
      organizationId: payload.organizationId,
      role: payload.role,
    };
    next();
  } catch (error) {
    next(error);
  }
}
