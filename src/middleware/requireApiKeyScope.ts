import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../shared/errors/AppError';

export function requireApiKeyScope(scope: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth || auth.type !== 'apiKey') {
      next(new UnauthorizedError('API key required', 'API_KEY_REQUIRED'));
      return;
    }

    if (!auth.scopes.includes(scope)) {
      next(new ForbiddenError(`Missing required scope: ${scope}`, 'INSUFFICIENT_SCOPE'));
      return;
    }

    next();
  };
}
