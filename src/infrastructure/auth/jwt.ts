import jwt, { type SignOptions } from 'jsonwebtoken';
import { validateEnv } from '../../config/env';
import { UnauthorizedError } from '../../shared/errors/AppError';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  organizationId: string;
  role: 'ADMIN' | 'MANAGER' | 'AGENT' | 'VIEWER';
};

export function signAccessToken(payload: AccessTokenPayload): string {
  const env = validateEnv();
  if (!env.JWT_SECRET) {
    throw new UnauthorizedError('JWT is not configured', 'JWT_NOT_CONFIGURED');
  }

  const expiresIn = env.JWT_EXPIRES_IN as SignOptions['expiresIn'];

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const env = validateEnv();
  if (!env.JWT_SECRET) {
    throw new UnauthorizedError('JWT is not configured', 'JWT_NOT_CONFIGURED');
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded !== 'object' || decoded === null) {
      throw new UnauthorizedError('Invalid token', 'INVALID_TOKEN');
    }

    const { sub, email, organizationId, role } = decoded as Partial<AccessTokenPayload>;
    if (!sub || !email || !organizationId || !role) {
      throw new UnauthorizedError('Invalid token payload', 'INVALID_TOKEN');
    }

    return { sub, email, organizationId, role };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Invalid or expired token', 'INVALID_TOKEN');
  }
}

/**
 * Platform Super Admin tokens are intentionally a separate shape from
 * AccessTokenPayload — a platform admin belongs to no single organization,
 * so this never carries organizationId and is verified by a distinct
 * middleware (platformAdminAuth), never by jwtAuth.
 */
export type PlatformAccessTokenPayload = {
  sub: string;
  email: string;
  scope: 'platform';
};

export function signPlatformAccessToken(
  payload: Omit<PlatformAccessTokenPayload, 'scope'>,
): string {
  const env = validateEnv();
  if (!env.JWT_SECRET) {
    throw new UnauthorizedError('JWT is not configured', 'JWT_NOT_CONFIGURED');
  }

  const expiresIn = env.JWT_EXPIRES_IN as SignOptions['expiresIn'];

  return jwt.sign({ ...payload, scope: 'platform' } satisfies PlatformAccessTokenPayload, env.JWT_SECRET, {
    expiresIn,
  });
}

export function verifyPlatformAccessToken(token: string): PlatformAccessTokenPayload {
  const env = validateEnv();
  if (!env.JWT_SECRET) {
    throw new UnauthorizedError('JWT is not configured', 'JWT_NOT_CONFIGURED');
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded !== 'object' || decoded === null) {
      throw new UnauthorizedError('Invalid token', 'INVALID_TOKEN');
    }

    const { sub, email, scope } = decoded as Partial<PlatformAccessTokenPayload>;
    if (!sub || !email || scope !== 'platform') {
      throw new UnauthorizedError('Invalid token payload', 'INVALID_TOKEN');
    }

    return { sub, email, scope };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Invalid or expired token', 'INVALID_TOKEN');
  }
}
