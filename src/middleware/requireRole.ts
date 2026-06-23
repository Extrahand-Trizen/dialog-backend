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
