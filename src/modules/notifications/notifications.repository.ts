import { Prisma } from '@prisma/client';
import type { NotificationSource } from '@prisma/client';
import { getPrismaClient } from '../../infrastructure/prisma/client';
import {
  ConflictError,
  InternalServerError,
  NotFoundError,
} from '../../shared/errors/AppError';
import type { EventIngestDto, EventIngestStatus, ExecutionStatus } from './notifications.schemas';

type EventIngestRow = {
  id: string;
  organizationId: string;
  correlationId: string;
  eventKey: string;
  idempotencyKey: string;
  recipientPhone: string;
  status: EventIngestStatus;
  errorMessage: string | null;
  processedAt: Date | null;
  createdAt: Date;
};

const eventIngestSelect = {
  id: true,
  organizationId: true,
  correlationId: true,
  eventKey: true,
  idempotencyKey: true,
  recipientPhone: true,
  status: true,
  errorMessage: true,
  processedAt: true,
  createdAt: true,
} as const;

function toEventIngestDto(row: EventIngestRow): EventIngestDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    correlationId: row.correlationId,
    eventKey: row.eventKey,
    idempotencyKey: row.idempotencyKey,
    recipientPhone: row.recipientPhone,
    status: row.status,
    errorMessage: row.errorMessage,
    processedAt: row.processedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

export async function insertEventIngest(input: {
  organizationId: string;
  correlationId: string;
  eventKey: string;
  idempotencyKey: string;
  recipientPhone: string;
  payload: Record<string, unknown>;
  apiKeyId?: string;
}): Promise<EventIngestDto> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  try {
    const row = await prisma.eventIngest.create({
      data: {
        organizationId: input.organizationId,
        correlationId: input.correlationId,
        eventKey: input.eventKey,
        idempotencyKey: input.idempotencyKey,
        recipientPhone: input.recipientPhone,
        payload: input.payload as Prisma.InputJsonValue,
        apiKeyId: input.apiKeyId,
      },
      select: eventIngestSelect,
    });

    return toEventIngestDto(row as EventIngestRow);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        'Event already ingested with this idempotency key',
        'EVENT_IDEMPOTENCY_CONFLICT',
      );
    }
    throw error;
  }
}

export async function findEventIngestByIdempotencyKey(input: {
  organizationId: string;
  idempotencyKey: string;
}): Promise<EventIngestDto | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.eventIngest.findUnique({
    where: {
      organizationId_idempotencyKey: {
        organizationId: input.organizationId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    select: eventIngestSelect,
  });

  return row ? toEventIngestDto(row as EventIngestRow) : null;
}

export async function requireEventIngestById(eventIngestId: string): Promise<EventIngestDto & {
  payload: Record<string, unknown>;
}> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.eventIngest.findUnique({
    where: { id: eventIngestId },
    select: {
      ...eventIngestSelect,
      payload: true,
    },
  });

  if (!row) {
    throw new NotFoundError('Event ingest not found', 'EVENT_INGEST_NOT_FOUND');
  }

  const payload =
    row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};

  return {
    ...toEventIngestDto(row as EventIngestRow),
    payload,
  };
}

export async function updateEventIngestStatus(input: {
  eventIngestId: string;
  status: EventIngestStatus;
  errorMessage?: string | null;
}): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  await prisma.eventIngest.update({
    where: { id: input.eventIngestId },
    data: {
      status: input.status,
      errorMessage: input.errorMessage ?? null,
      processedAt:
        input.status === 'PROCESSED' ||
        input.status === 'FAILED' ||
        input.status === 'SKIPPED'
          ? new Date()
          : undefined,
    },
  });
}

export async function createNotificationExecution(input: {
  organizationId: string;
  correlationId: string;
  eventIngestId: string;
  notificationRuleId?: string;
  ruleVersion?: number;
  templateVersionId?: string;
  messageId?: string;
  status: ExecutionStatus;
  source?: NotificationSource;
  skipReason?: string;
  errorMessage?: string;
}): Promise<{ executionId: string }> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.notificationExecution.create({
    data: {
      organizationId: input.organizationId,
      correlationId: input.correlationId,
      eventIngestId: input.eventIngestId,
      notificationRuleId: input.notificationRuleId,
      ruleVersion: input.ruleVersion,
      templateVersionId: input.templateVersionId,
      messageId: input.messageId,
      source: input.source ?? 'EVENT',
      status: input.status,
      skipReason: input.skipReason,
      errorMessage: input.errorMessage,
    },
    select: { id: true },
  });

  return { executionId: row.id };
}

export async function updateNotificationExecutionByMessageId(input: {
  messageId: string;
  status: ExecutionStatus;
  errorMessage?: string | null;
}): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  await prisma.notificationExecution.updateMany({
    where: { messageId: input.messageId },
    data: {
      status: input.status,
      errorMessage: input.errorMessage ?? null,
    },
  });
}

export async function findLatestExecutionForEventIngest(
  eventIngestId: string,
): Promise<{ executionId: string; messageId: string | null; status: ExecutionStatus } | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.notificationExecution.findFirst({
    where: { eventIngestId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      messageId: true,
      status: true,
    },
  });

  return row
    ? {
        executionId: row.id,
        messageId: row.messageId,
        status: row.status as ExecutionStatus,
      }
    : null;
}

export async function listEventIngestsByOrganization(input: {
  organizationId: string;
  page: number;
  limit: number;
  status?: EventIngestStatus;
  eventKey?: string;
}): Promise<{ items: EventIngestDto[]; total: number }> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const where: Prisma.EventIngestWhereInput = {
    organizationId: input.organizationId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.eventKey
      ? { eventKey: { contains: input.eventKey, mode: 'insensitive' } }
      : {}),
  };

  const skip = (input.page - 1) * input.limit;

  const [rows, total] = await Promise.all([
    prisma.eventIngest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: input.limit,
      select: eventIngestSelect,
    }),
    prisma.eventIngest.count({ where }),
  ]);

  return {
    items: rows.map((row) => toEventIngestDto(row as EventIngestRow)),
    total,
  };
}
