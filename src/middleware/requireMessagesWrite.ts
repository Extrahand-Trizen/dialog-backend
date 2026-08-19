import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../shared/errors/AppError';

const MESSAGES_WRITE_SCOPE = 'messages:write';
const MESSAGES_WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'AGENT']);

/** API key needs messages:write; JWT users must be Admin, Manager, or Agent. */
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

  if (auth.type !== 'jwt') {
    next(new UnauthorizedError('Authentication required'));
    return;
  }

  if (!MESSAGES_WRITE_ROLES.has(auth.role)) {
    next(new ForbiddenError('Admin, Manager, or Agent access required', 'MESSAGES_WRITE_REQUIRED'));
    return;
  }

  next();
}
