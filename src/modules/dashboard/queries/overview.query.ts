import { getPrismaClient } from '../../../infrastructure/prisma/client';
import { InternalServerError } from '../../../shared/errors/AppError';
import type { DashboardOverviewDto, DashboardPeriod, StatusCountMap } from '../dashboard.schemas';

function periodStartDate(period: DashboardPeriod): Date {
  const now = new Date();
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function toCountMap(
  rows: { status: string; _count: { _all: number } }[],
): StatusCountMap {
  const map: StatusCountMap = {};
  for (const row of rows) {
    map[row.status] = row._count._all;
  }
  return map;
}

function sumCounts(map: StatusCountMap): number {
  return Object.values(map).reduce((total, count) => total + count, 0);
}

function computeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 1000) / 10;
}

export async function fetchDashboardOverview(input: {
  organizationId: string;
  period: DashboardPeriod;
}): Promise<DashboardOverviewDto> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const periodStart = periodStartDate(input.period);
  const createdAtFilter = { gte: periodStart };

  const [messageGroups, eventGroups, executionGroups] = await Promise.all([
    prisma.message.groupBy({
      by: ['status'],
      where: {
        organizationId: input.organizationId,
        createdAt: createdAtFilter,
      },
      _count: { _all: true },
    }),
    prisma.eventIngest.groupBy({
      by: ['status'],
      where: {
        organizationId: input.organizationId,
        createdAt: createdAtFilter,
      },
      _count: { _all: true },
    }),
    prisma.notificationExecution.groupBy({
      by: ['status'],
      where: {
        organizationId: input.organizationId,
        createdAt: createdAtFilter,
      },
      _count: { _all: true },
    }),
  ]);

  const messagesByStatus = toCountMap(messageGroups);
  const eventsByStatus = toCountMap(eventGroups);
  const executionsByStatus = toCountMap(executionGroups);

  const sent = messagesByStatus.SENT ?? 0;
  const delivered = messagesByStatus.DELIVERED ?? 0;
  const read = messagesByStatus.READ ?? 0;

  return {
    period: input.period,
    periodStart: periodStart.toISOString(),
    messages: {
      total: sumCounts(messagesByStatus),
      byStatus: messagesByStatus,
      deliveryRate: computeRate(delivered + read, sent + delivered + read),
      readRate: computeRate(read, delivered + read),
    },
    events: {
      total: sumCounts(eventsByStatus),
      byStatus: eventsByStatus,
    },
    executions: {
      total: sumCounts(executionsByStatus),
      byStatus: executionsByStatus,
    },
  };
}
