import bcrypt from 'bcryptjs';
import { UnauthorizedError } from '../../shared/errors/AppError';
import {
  signAccessToken,
  type AccessTokenPayload,
} from '../../infrastructure/auth/jwt';
import type { AuthUserDto, LoginInput, LoginResultDto } from './auth.schemas';
import {
  findUserByEmailWithMembership,
  findUserByIdWithMembership,
  updateUserLastLogin,
  type UserWithMembershipDto,
} from './auth.repository';

function toAuthUserDto(user: UserWithMembershipDto): AuthUserDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    organizationId: user.organizationId,
    organizationSlug: user.organizationSlug,
  };
}

export async function login(input: LoginInput): Promise<LoginResultDto> {
  const user = await findUserByEmailWithMembership(input.email.toLowerCase());

  if (!user || !user.isActive || !user.passwordHash) {
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const token = signAccessToken({
    sub: user.id,
    email: user.email,
    organizationId: user.organizationId,
    role: user.role,
  });

  await updateUserLastLogin(user.id);

  return {
    token,
    user: toAuthUserDto(user),
  };
}

export async function getMeFromTokenPayload(payload: AccessTokenPayload): Promise<AuthUserDto> {
  const user = await findUserByIdWithMembership(payload.sub);

  if (!user || !user.isActive) {
    throw new UnauthorizedError('User not found or inactive', 'USER_INACTIVE');
  }

  if (user.organizationId !== payload.organizationId) {
    throw new UnauthorizedError('Organization membership changed', 'ORG_MEMBERSHIP_CHANGED');
  }

  return toAuthUserDto(user);
}
