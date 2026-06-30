import { Request, Response, NextFunction } from 'express';
import { validateEnv } from '../config/env';
import { UnauthorizedError } from '../shared/errors/AppError';

export function serviceAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.headers['x-service-auth'];
  const expected = validateEnv().SERVICE_AUTH_TOKEN;

  if (!expected) {
    next(new UnauthorizedError('Service auth not configured', 'SERVICE_AUTH_NOT_CONFIGURED'));
    return;
  }

  if (typeof token !== 'string' || token !== expected) {
    next(new UnauthorizedError('Invalid service auth token', 'INVALID_SERVICE_AUTH'));
    return;
  }

  next();
}
