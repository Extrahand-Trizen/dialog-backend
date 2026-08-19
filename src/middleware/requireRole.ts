import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../shared/errors/AppError';

export function requireJwtAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth || req.auth.type !== 'jwt') {
    next(new UnauthorizedError('Authentication required'));
    return;
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth || req.auth.type !== 'jwt') {
    next(new UnauthorizedError('Authentication required'));
    return;
  }
  if (req.auth.role !== 'ADMIN') {
    next(new ForbiddenError('Admin access required', 'ADMIN_REQUIRED'));
    return;
  }
  next();
}

/** Templates, notification rules, media: operational work Manager also owns. */
export function requireManagerOrAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth || req.auth.type !== 'jwt') {
    next(new UnauthorizedError('Authentication required'));
    return;
  }
  if (req.auth.role !== 'ADMIN' && req.auth.role !== 'MANAGER') {
    next(new ForbiddenError('Admin or Manager access required', 'MANAGER_REQUIRED'));
    return;
  }
  next();
}

export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth || req.auth.type !== 'platformAdmin') {
    next(new UnauthorizedError('Platform admin authentication required'));
    return;
  }
  next();
}
