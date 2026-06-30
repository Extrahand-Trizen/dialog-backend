import jwt, { type SignOptions } from 'jsonwebtoken';
import { validateEnv } from '../../config/env';
import { UnauthorizedError } from '../../shared/errors/AppError';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  organizationId: string;
  role: 'ADMIN' | 'VIEWER';
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
