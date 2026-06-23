import { getPrismaClient } from '../../infrastructure/prisma/client';
import { InternalServerError } from '../../shared/errors/AppError';

export type UserWithMembershipDto = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string | null;
  isActive: boolean;
  organizationId: string;
  organizationSlug: string;
  role: 'ADMIN' | 'VIEWER';
};

export async function findUserByEmailWithMembership(
  email: string,
): Promise<UserWithMembershipDto | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      passwordHash: true,
      isActive: true,
      memberships: {
        take: 1,
        orderBy: { createdAt: 'asc' },
        select: {
          role: true,
          organization: {
            select: {
              id: true,
              slug: true,
              isActive: true,
            },
          },
        },
      },
    },
  });

  if (!user || user.memberships.length === 0) {
    return null;
  }

  const membership = user.memberships[0];
  if (!membership.organization.isActive) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    passwordHash: user.passwordHash,
    isActive: user.isActive,
    organizationId: membership.organization.id,
    organizationSlug: membership.organization.slug,
    role: membership.role,
  };
}

export async function findUserByIdWithMembership(
  userId: string,
): Promise<UserWithMembershipDto | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      passwordHash: true,
      isActive: true,
      memberships: {
        take: 1,
        orderBy: { createdAt: 'asc' },
        select: {
          role: true,
          organization: {
            select: {
              id: true,
              slug: true,
              isActive: true,
            },
          },
        },
      },
    },
  });

  if (!user || user.memberships.length === 0) {
    return null;
  }

  const membership = user.memberships[0];
  if (!membership.organization.isActive) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    passwordHash: user.passwordHash,
    isActive: user.isActive,
    organizationId: membership.organization.id,
    organizationSlug: membership.organization.slug,
    role: membership.role,
  };
}

export async function updateUserLastLogin(userId: string): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });
}
