import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../shared/errors/AppError';

const MESSAGES_WRITE_SCOPE = 'messages:write';

/** API key needs messages:write; JWT users must be ADMIN. */
export function requireMessagesWrite(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.auth;
  if (!auth) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }

  if (auth.type === 'apiKey') {
    if (!auth.scopes.includes(MESSAGES_WRITE_SCOPE)) {
      next(new ForbiddenError(`Missing required scope: ${MESSAGES_WRITE_SCOPE}`, 'INSUFFICIENT_SCOPE'));
      return;
    }
    next();
    return;
  }

  if (auth.role !== 'ADMIN') {
    next(new ForbiddenError('Admin access required', 'ADMIN_REQUIRED'));
    return;
  }

  next();
}
