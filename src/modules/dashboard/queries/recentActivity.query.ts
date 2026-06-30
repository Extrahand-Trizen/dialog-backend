import { getPrismaClient } from '../../../infrastructure/prisma/client';
import { InternalServerError } from '../../../shared/errors/AppError';
import type { RecentActivityItemDto } from '../dashboard.schemas';

export async function fetchRecentActivity(input: {
  organizationId: string;
  limit: number;
}): Promise<RecentActivityItemDto[]> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const fetchLimit = Math.min(input.limit, 50);

  const [messages, events] = await Promise.all([
    prisma.message.findMany({
      where: { organizationId: input.organizationId },
      orderBy: { createdAt: 'desc' },
      take: fetchLimit,
      select: {
        id: true,
        createdAt: true,
        status: true,
        recipientPhone: true,
        metaTemplateName: true,
        correlationId: true,
      },
    }),
    prisma.eventIngest.findMany({
      where: { organizationId: input.organizationId },
      orderBy: { createdAt: 'desc' },
      take: fetchLimit,
      select: {
        id: true,
        createdAt: true,
        status: true,
        eventKey: true,
        recipientPhone: true,
        correlationId: true,
      },
    }),
  ]);

  const items: RecentActivityItemDto[] = [
    ...messages.map(
      (row): RecentActivityItemDto => ({
        type: 'message',
        id: row.id,
        occurredAt: row.createdAt.toISOString(),
        status: row.status,
        recipientPhone: row.recipientPhone,
        metaTemplateName: row.metaTemplateName,
        correlationId: row.correlationId,
      }),
    ),
    ...events.map(
      (row): RecentActivityItemDto => ({
        type: 'event',
        id: row.id,
        occurredAt: row.createdAt.toISOString(),
        status: row.status,
        eventKey: row.eventKey,
        recipientPhone: row.recipientPhone,
        correlationId: row.correlationId,
      }),
    ),
  ];

  items.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  return items.slice(0, fetchLimit);
}
