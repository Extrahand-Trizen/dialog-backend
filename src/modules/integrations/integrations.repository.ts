import { getPrismaClient } from '../../infrastructure/prisma/client';
import { InternalServerError } from '../../shared/errors/AppError';

export async function findActiveOrganizationById(
  organizationId: string,
): Promise<{ id: string; slug: string } | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.organization.findFirst({
    where: {
      id: organizationId,
      isActive: true,
    },
    select: {
      id: true,
      slug: true,
    },
  });

  return row;
}
