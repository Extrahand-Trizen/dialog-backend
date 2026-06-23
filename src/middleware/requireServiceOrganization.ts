import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../shared/errors/AppError';

export function requireServiceOrganization(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const raw = req.headers['x-organization-id'];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    next(new ValidationError('X-Organization-Id header is required'));
    return;
  }

  req.serviceOrganizationId = raw.trim();
  next();
}
