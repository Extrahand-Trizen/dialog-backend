import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../../infrastructure/prisma/client';
import { InternalServerError, NotFoundError } from '../../shared/errors/AppError';
import type { WebhookEventDto, WebhookEventStatus, WebhookEventType } from './webhooks.schemas';

type WebhookRow = {
  id: string;
  organizationId: string | null;
  metaWabaId: string | null;
  metaEventId: string | null;
  correlationId: string | null;
  eventType: WebhookEventType;
  status: WebhookEventStatus;
  attemptCount: number;
  errorMessage: string | null;
  receivedAt: Date;
  processedAt: Date | null;
  payload: Prisma.JsonValue;
};

function toWebhookEventDto(row: Omit<WebhookRow, 'payload'>): WebhookEventDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    metaWabaId: row.metaWabaId,
    metaEventId: row.metaEventId,
    correlationId: row.correlationId,
    eventType: row.eventType,
    status: row.status,
    attemptCount: row.attemptCount,
    errorMessage: row.errorMessage,
    receivedAt: row.receivedAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
  };
}

const eventSelect = {
  id: true,
  organizationId: true,
  metaWabaId: true,
  metaEventId: true,
  correlationId: true,
  eventType: true,
  status: true,
  attemptCount: true,
  errorMessage: true,
  receivedAt: true,
  processedAt: true,
  payload: true,
} as const;

export async function insertWebhookEvent(input: {
  organizationId: string | null;
  metaWabaId: string | null;
  metaEventId: string;
  correlationId?: string;
  eventType: WebhookEventType;
  payload: Prisma.InputJsonValue;
}): Promise<{ event: WebhookEventDto; isDuplicate: boolean }> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  try {
    const row = await prisma.webhookEvent.create({
      data: {
        organizationId: input.organizationId,
        metaWabaId: input.metaWabaId,
        metaEventId: input.metaEventId,
        correlationId: input.correlationId,
        eventType: input.eventType,
        payload: input.payload,
        status: 'RECEIVED',
      },
      select: eventSelect,
    });

    const { payload: _payload, ...rest } = row;
    return { event: toWebhookEventDto(rest), isDuplicate: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.webhookEvent.findUnique({
        where: { metaEventId: input.metaEventId },
        select: eventSelect,
      });

      if (!existing) {
        throw error;
      }

      const { payload: _payload, ...rest } = existing;
      return { event: toWebhookEventDto(rest), isDuplicate: true };
    }

    throw error;
  }
}

export async function findWebhookEventById(webhookEventId: string): Promise<WebhookRow | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  return prisma.webhookEvent.findUnique({
    where: { id: webhookEventId },
    select: eventSelect,
  });
}

export async function markWebhookEventProcessing(webhookEventId: string): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: {
      status: 'PROCESSING',
      attemptCount: { increment: 1 },
    },
  });
}

export async function markWebhookEventProcessed(
  webhookEventId: string,
  correlationId?: string | null,
): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: {
      status: 'PROCESSED',
      processedAt: new Date(),
      errorMessage: null,
      ...(correlationId ? { correlationId } : {}),
    },
  });
}

export async function markWebhookEventFailed(
  webhookEventId: string,
  errorMessage: string,
): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: {
      status: 'FAILED',
      errorMessage,
      processedAt: new Date(),
    },
  });
}

export async function requireWebhookEventById(webhookEventId: string): Promise<WebhookRow> {
  const event = await findWebhookEventById(webhookEventId);
  if (!event) {
    throw new NotFoundError('Webhook event not found', 'WEBHOOK_EVENT_NOT_FOUND');
  }
  return event;
}
