import { MessageType, Prisma } from '@prisma/client';
import { getPrismaClient } from '../../infrastructure/prisma/client';
import { InternalServerError, NotFoundError } from '../../shared/errors/AppError';
import type { MetaSendTemplateComponent } from '../../infrastructure/meta';
import type { MessageDetailDto, MessageSummaryDto } from './messages.schemas';
import type { MessageSendContextDto, OutboundTemplateMessageInput } from './messages.schemas';

export type MessageStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export type MessageStatusUpdateResult = {
  messageId: string;
  organizationId: string;
  correlationId: string | null;
  status: MessageStatus;
};

/** Higher rank wins. FAILED is terminal so a late "sent" webhook cannot hide a failure. */
const MESSAGE_STATUS_RANK: Record<MessageStatus, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 100,
};

export function shouldApplyWebhookMessageStatus(
  current: MessageStatus,
  next: MessageStatus,
): boolean {
  if (current === next) {
    return true;
  }
  if (current === 'FAILED') {
    return false;
  }
  if (next === 'FAILED') {
    return true;
  }
  return MESSAGE_STATUS_RANK[next] >= MESSAGE_STATUS_RANK[current];
}

export async function updateMessageFromStatusWebhook(input: {
  metaMessageId: string;
  status: MessageStatus;
  timestampSeconds?: number;
  errorCode?: string;
  errorMessage?: string;
  pricingCategory?: string;
  pricingModel?: string;
  billable?: boolean;
  metaConversationId?: string;
  rawStatusPayload?: object;
}): Promise<MessageStatusUpdateResult | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const existing = await prisma.message.findUnique({
    where: { metaMessageId: input.metaMessageId },
    select: { id: true, organizationId: true, correlationId: true, status: true },
  });

  if (!existing) {
    return null;
  }

  if (!shouldApplyWebhookMessageStatus(existing.status, input.status)) {
    return {
      messageId: existing.id,
      organizationId: existing.organizationId,
      correlationId: existing.correlationId,
      status: existing.status,
    };
  }

  const eventTime = input.timestampSeconds
    ? new Date(input.timestampSeconds * 1000)
    : new Date();

  const statusChanged = existing.status !== input.status;

  const data: {
    status: MessageStatus;
    statusUpdatedAt: Date;
    rawStatusPayload?: Prisma.InputJsonValue;
    errorCode?: string | null;
    errorMessage?: string | null;
    pricingCategory?: string | null;
    pricingModel?: string | null;
    billable?: boolean | null;
    metaConversationId?: string | null;
    sentAt?: Date;
    deliveredAt?: Date;
    readAt?: Date;
    failedAt?: Date;
  } = {
    status: input.status,
    statusUpdatedAt: eventTime,
    ...(input.rawStatusPayload
      ? { rawStatusPayload: input.rawStatusPayload as Prisma.InputJsonValue }
      : {}),
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    pricingCategory: input.pricingCategory ?? null,
    pricingModel: input.pricingModel ?? null,
    billable: input.billable ?? null,
    metaConversationId: input.metaConversationId ?? null,
  };

  if (input.status === 'SENT') {
    data.sentAt = eventTime;
  }
  if (input.status === 'DELIVERED') {
    data.deliveredAt = eventTime;
  }
  if (input.status === 'READ') {
    data.readAt = eventTime;
  }
  if (input.status === 'FAILED') {
    data.failedAt = eventTime;
  }

  const updated = await prisma.message.update({
    where: { id: existing.id },
    data,
    select: { id: true, correlationId: true },
  });

  if (!statusChanged && !input.rawStatusPayload) {
    return null;
  }

  return {
    messageId: updated.id,
    organizationId: existing.organizationId,
    correlationId: updated.correlationId,
    status: input.status,
  };
}

export async function createInboundMessageFromWebhook(input: {
  organizationId: string;
  phoneNumberId: string;
  metaMessageId: string;
  customerPhone: string;
  messageType: MessageType;
  bodyText?: string;
  rawPayload: object;
}): Promise<{ messageId: string; created: boolean; normalizedCustomerPhone: string }> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  // Defensive: Meta's `from` is already digits-only, but strip stray `+`/whitespace so an
  // inbound message can never key to a different Conversation row than its outbound replies.
  const normalizedCustomerPhone = input.customerPhone.replace(/\D/g, '') || input.customerPhone;

  const existing = await prisma.message.findUnique({
    where: { metaMessageId: input.metaMessageId },
    select: { id: true },
  });

  if (existing) {
    return { messageId: existing.id, created: false, normalizedCustomerPhone };
  }

  const row = await prisma.message.create({
    data: {
      organizationId: input.organizationId,
      phoneNumberId: input.phoneNumberId,
      direction: 'INBOUND',
      recipientPhone: normalizedCustomerPhone,
      type: input.messageType,
      metaMessageId: input.metaMessageId,
      bodyText: input.bodyText,
      status: 'DELIVERED',
      statusUpdatedAt: new Date(),
      rawPayload: input.rawPayload as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  return { messageId: row.id, created: true, normalizedCustomerPhone };
}

export async function createOutboundTemplateMessage(
  input: OutboundTemplateMessageInput,
): Promise<{ messageId: string }> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.message.create({
    data: {
      organizationId: input.organizationId,
      phoneNumberId: input.phoneNumberId,
      correlationId: input.correlationId,
      recipientPhone: input.recipientPhone,
      type: 'TEMPLATE',
      templateVersionId: input.templateVersionId,
      metaTemplateName: input.metaTemplateName,
      status: 'QUEUED',
      components: input.metaComponents as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  return { messageId: row.id };
}

export async function createOutboundTextMessage(input: {
  organizationId: string;
  phoneNumberId: string;
  recipientPhone: string;
  correlationId: string;
  bodyText: string;
}): Promise<{ messageId: string }> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.message.create({
    data: {
      organizationId: input.organizationId,
      phoneNumberId: input.phoneNumberId,
      correlationId: input.correlationId,
      recipientPhone: input.recipientPhone,
      type: 'TEXT',
      bodyText: input.bodyText,
      status: 'QUEUED',
    },
    select: { id: true },
  });

  return { messageId: row.id };
}

export async function findMessageSendContext(messageId: string): Promise<MessageSendContextDto | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      organizationId: true,
      correlationId: true,
      recipientPhone: true,
      type: true,
      metaTemplateName: true,
      bodyText: true,
      components: true,
      templateVersionId: true,
      phoneNumberId: true,
      templateVersion: {
        select: {
          template: {
            select: { language: true },
          },
        },
      },
      phoneNumber: {
        select: {
          metaPhoneNumberId: true,
          whatsAppAccountId: true,
          qualityRating: true,
          whatsAppAccount: {
            select: { organizationId: true },
          },
        },
      },
    },
  });

  if (!row || !row.phoneNumber) {
    return null;
  }
  if (row.type === 'TEMPLATE' && !row.metaTemplateName) {
    return null;
  }
  if (row.type === 'TEXT' && !row.bodyText) {
    return null;
  }

  return {
    messageId: row.id,
    organizationId: row.organizationId,
    correlationId: row.correlationId,
    recipientPhone: row.recipientPhone,
    type: row.type,
    metaTemplateName: row.metaTemplateName,
    bodyText: row.bodyText,
    language: row.templateVersion?.template.language ?? 'en',
    templateVersionId: row.templateVersionId ?? null,
    metaComponents: (row.components ?? []) as MetaSendTemplateComponent[],
    metaPhoneNumberId: row.phoneNumber.metaPhoneNumberId,
    phoneNumberId: row.phoneNumberId,
    phoneOrganizationId: row.phoneNumber.whatsAppAccount.organizationId,
    whatsAppAccountId: row.phoneNumber.whatsAppAccountId,
    qualityRating: row.phoneNumber.qualityRating,
  };
}

export async function updateMessageComponents(
  messageId: string,
  components: MetaSendTemplateComponent[],
): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  await prisma.message.update({
    where: { id: messageId },
    data: { components: components as Prisma.InputJsonValue },
  });
}

export async function requireMessageSendContext(messageId: string): Promise<MessageSendContextDto> {
  const context = await findMessageSendContext(messageId);
  if (!context) {
    throw new NotFoundError('Message not found for send', 'MESSAGE_NOT_FOUND');
  }
  return context;
}

export async function markMessageSent(input: {
  messageId: string;
  metaMessageId: string;
}): Promise<{ organizationId: string }> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const updated = await prisma.message.update({
    where: { id: input.messageId },
    data: {
      status: 'SENT',
      metaMessageId: input.metaMessageId,
      sentAt: new Date(),
    },
    select: { organizationId: true },
  });

  return { organizationId: updated.organizationId };
}

export async function markMessageFailed(input: {
  messageId: string;
  errorCode?: string;
  errorMessage: string;
}): Promise<{ organizationId: string }> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const updated = await prisma.message.update({
    where: { id: input.messageId },
    data: {
      status: 'FAILED',
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage,
      failedAt: new Date(),
    },
    select: { organizationId: true },
  });

  return { organizationId: updated.organizationId };
}

type MessageSummaryRow = {
  id: string;
  organizationId: string;
  phoneNumberId: string;
  correlationId: string | null;
  recipientPhone: string;
  type: string;
  metaTemplateName: string | null;
  metaMessageId: string | null;
  status: MessageStatus;
  errorCode: string | null;
  errorMessage: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const messageSummarySelect = {
  id: true,
  organizationId: true,
  phoneNumberId: true,
  correlationId: true,
  recipientPhone: true,
  type: true,
  metaTemplateName: true,
  metaMessageId: true,
  status: true,
  errorCode: true,
  errorMessage: true,
  sentAt: true,
  deliveredAt: true,
  readAt: true,
  failedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toMessageSummaryDto(row: MessageSummaryRow): MessageSummaryDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    phoneNumberId: row.phoneNumberId,
    correlationId: row.correlationId,
    recipientPhone: row.recipientPhone,
    type: row.type,
    metaTemplateName: row.metaTemplateName,
    metaMessageId: row.metaMessageId,
    status: row.status,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    sentAt: row.sentAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listMessagesByOrganization(input: {
  organizationId: string;
  page: number;
  limit: number;
  status?: MessageStatus;
  recipientPhone?: string;
  metaTemplateName?: string;
  idempotencyKey?: string;
}): Promise<{ items: MessageSummaryDto[]; total: number }> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const where: Prisma.MessageWhereInput = {
    organizationId: input.organizationId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.recipientPhone
      ? { recipientPhone: { contains: input.recipientPhone.replace(/\D/g, '') } }
      : {}),
    ...(input.metaTemplateName
      ? { metaTemplateName: { contains: input.metaTemplateName, mode: 'insensitive' } }
      : {}),
    ...(input.idempotencyKey ? { correlationId: input.idempotencyKey } : {}),
  };

  const skip = (input.page - 1) * input.limit;

  const [rows, total] = await Promise.all([
    prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: input.limit,
      select: messageSummarySelect,
    }),
    prisma.message.count({ where }),
  ]);

  return {
    items: rows.map((row) => toMessageSummaryDto(row as MessageSummaryRow)),
    total,
  };
}

export async function findMessageById(
  organizationId: string,
  messageId: string,
): Promise<MessageDetailDto | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.message.findFirst({
    where: {
      id: messageId,
      organizationId,
    },
    select: {
      ...messageSummarySelect,
      components: true,
      bodyText: true,
      pricingCategory: true,
      pricingModel: true,
      billable: true,
      metaConversationId: true,
      templateVersionId: true,
      phoneNumber: {
        select: {
          id: true,
          displayNumber: true,
          verifiedName: true,
        },
      },
    },
  });

  if (!row) {
    return null;
  }

  const summary = toMessageSummaryDto(row as MessageSummaryRow);

  return {
    ...summary,
    components: row.components,
    bodyText: row.bodyText,
    pricingCategory: row.pricingCategory,
    pricingModel: row.pricingModel,
    billable: row.billable,
    metaConversationId: row.metaConversationId,
    templateVersionId: row.templateVersionId,
    phoneNumber: row.phoneNumber,
  };
}

export async function requireMessageById(
  organizationId: string,
  messageId: string,
): Promise<MessageDetailDto> {
  const message = await findMessageById(organizationId, messageId);
  if (!message) {
    throw new NotFoundError('Message not found', 'MESSAGE_NOT_FOUND');
  }
  return message;
}

export async function findOutboundMessageByIdempotencyKey(input: {
  organizationId: string;
  idempotencyKey: string;
}): Promise<{ id: string; status: MessageStatus } | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.message.findFirst({
    where: {
      organizationId: input.organizationId,
      correlationId: input.idempotencyKey,
      direction: 'OUTBOUND',
    },
    select: {
      id: true,
      status: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return row ? { id: row.id, status: row.status as MessageStatus } : null;
}

export async function findTemplateVersionComponentsForOrg(
  organizationId: string,
  templateVersionId: string,
): Promise<{ components: Prisma.JsonValue } | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  return prisma.templateVersion.findFirst({
    where: { id: templateVersionId, template: { organizationId } },
    select: { components: true },
  });
}

export async function findMessageCorrelationIdForOrg(
  organizationId: string,
  messageId: string,
): Promise<string | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const row = await prisma.message.findFirst({
    where: { id: messageId, organizationId },
    select: { correlationId: true },
  });

  return row?.correlationId ?? null;
}

/**
 * Recovers the raw event payload for a staged message's correlationId, scoped
 * to the sending org — correlationId is client-controlled (x-correlation-id
 * header) and not globally unique, so an unscoped lookup here would leak
 * another organization's EventIngest payload into this org's outbound message.
 */
export async function findLatestEventPayloadByCorrelationIdForOrg(
  organizationId: string,
  correlationId: string,
): Promise<Record<string, unknown> | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const event = await prisma.eventIngest.findFirst({
    where: { organizationId, correlationId },
    select: { payload: true },
    orderBy: { createdAt: 'desc' },
  });

  if (event?.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)) {
    return event.payload as Record<string, unknown>;
  }
  return null;
}
