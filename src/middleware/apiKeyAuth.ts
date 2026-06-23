import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../shared/errors/AppError';
import { resolveApiKey } from '../modules/apiKeys/apiKeys.service';

export function apiKeyAuth(req: Request, _res: Response, next: NextFunction): void {
  const apiKey =
    (typeof req.headers['x-api-key'] === 'string' && req.headers['x-api-key']) ||
    (typeof req.headers.authorization === 'string' &&
    req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined);

  if (!apiKey) {
    next(new UnauthorizedError('API key required', 'API_KEY_REQUIRED'));
    return;
  }

  void resolveApiKey(apiKey)
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
}
