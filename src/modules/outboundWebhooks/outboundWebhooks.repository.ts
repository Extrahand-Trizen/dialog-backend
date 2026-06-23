import { getPrismaClient } from '../../infrastructure/prisma/client';
import { InternalServerError, ValidationError } from '../../shared/errors/AppError';
import type { OutboundWebhookConfigDto } from './outboundWebhooks.schemas';
import { OUTBOUND_WEBHOOK_EVENTS } from './outboundWebhooks.schemas';

type ConfigRow = {
  url: string;
  secretEnc: string;
  enabled: boolean;
  updatedAt: Date;
};

function toConfigDto(row: ConfigRow | null): OutboundWebhookConfigDto {
  if (!row) {
    return {
      url: '',
      enabled: false,
      hasSecret: false,
      events: [...OUTBOUND_WEBHOOK_EVENTS],
      updatedAt: null,
    };
  }

  return {
    url: row.url,
    enabled: row.enabled,
    hasSecret: Boolean(row.secretEnc),
    events: [...OUTBOUND_WEBHOOK_EVENTS],
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findOutboundWebhookConfig(
  organizationId: string,
): Promise<OutboundWebhookConfigDto> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.outboundWebhookConfig.findUnique({
    where: { organizationId },
    select: {
      url: true,
      secretEnc: true,
      enabled: true,
      updatedAt: true,
    },
  });

  return toConfigDto(row);
}

export async function findOutboundWebhookSecrets(
  organizationId: string,
): Promise<{ url: string; secretEnc: string } | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.outboundWebhookConfig.findFirst({
    where: {
      organizationId,
      enabled: true,
    },
    select: {
      url: true,
      secretEnc: true,
    },
  });

  return row;
}

export async function upsertOutboundWebhookConfig(input: {
  organizationId: string;
  url: string;
  secretEnc: string;
  enabled: boolean;
  userId: string;
}): Promise<OutboundWebhookConfigDto> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.outboundWebhookConfig.upsert({
    where: { organizationId: input.organizationId },
    create: {
      organizationId: input.organizationId,
      url: input.url,
      secretEnc: input.secretEnc,
      enabled: input.enabled,
      createdById: input.userId,
      updatedById: input.userId,
    },
    update: {
      url: input.url,
      secretEnc: input.secretEnc,
      enabled: input.enabled,
      updatedById: input.userId,
    },
    select: {
      url: true,
      secretEnc: true,
      enabled: true,
      updatedAt: true,
    },
  });

  return toConfigDto(row);
}

export async function patchOutboundWebhookConfig(input: {
  organizationId: string;
  url: string;
  secretEnc?: string;
  enabled: boolean;
  userId: string;
}): Promise<OutboundWebhookConfigDto> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const existing = await prisma.outboundWebhookConfig.findUnique({
    where: { organizationId: input.organizationId },
    select: { id: true, secretEnc: true },
  });

  if (!existing) {
    if (!input.secretEnc) {
      throw new ValidationError('Signing secret is required when configuring webhooks for the first time');
    }

    return upsertOutboundWebhookConfig({
      organizationId: input.organizationId,
      url: input.url,
      secretEnc: input.secretEnc,
      enabled: input.enabled,
      userId: input.userId,
    });
  }

  const row = await prisma.outboundWebhookConfig.update({
    where: { organizationId: input.organizationId },
    data: {
      url: input.url,
      enabled: input.enabled,
      updatedById: input.userId,
      ...(input.secretEnc ? { secretEnc: input.secretEnc } : {}),
    },
    select: {
      url: true,
      secretEnc: true,
      enabled: true,
      updatedAt: true,
    },
  });

  return toConfigDto(row);
}

export async function findMessageWebhookPayload(messageId: string): Promise<{
  organizationId: string;
  correlationId: string | null;
  metaTemplateName: string | null;
  recipientPhone: string;
  status: string;
  metaMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
} | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      organizationId: true,
      correlationId: true,
      metaTemplateName: true,
      recipientPhone: true,
      status: true,
      metaMessageId: true,
      errorCode: true,
      errorMessage: true,
    },
  });

  return row;
}
