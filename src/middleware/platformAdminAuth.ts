import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../shared/errors/AppError';
import { verifyPlatformAccessToken } from '../infrastructure/auth/jwt';

/**
 * Verifies a Platform Super Admin token. Deliberately separate from jwtAuth —
 * a platform admin belongs to no single organization, so this never touches
 * organizationId or the org-scoped AccessTokenPayload shape.
 */
export function platformAdminAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or invalid authorization header'));
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyPlatformAccessToken(token);
    req.auth = {
      type: 'platformAdmin',
      userId: payload.sub,
      email: payload.email,
    };
    next();
  } catch (error) {
    next(error);
  }
}
