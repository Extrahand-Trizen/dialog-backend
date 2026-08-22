import { getPrismaClient } from '../../infrastructure/prisma/client';
import { InternalServerError, NotFoundError } from '../../shared/errors/AppError';
import type { MessageDirection } from '@prisma/client';
import type { ConversationSummaryDto, ConversationThreadMessageDto } from './conversations.schemas';

const PREVIEW_MAX_LENGTH = 120;

/** Renders a short list-row preview for a message that just became the "latest" one. */
export function buildMessagePreview(input: {
  type: string;
  bodyText?: string | null;
  metaTemplateName?: string | null;
}): string | null {
  if (input.type === 'TEMPLATE') {
    return input.metaTemplateName ? `Template: ${input.metaTemplateName}` : 'Template message';
  }
  if (input.bodyText && input.bodyText.trim().length > 0) {
    const trimmed = input.bodyText.trim();
    return trimmed.length > PREVIEW_MAX_LENGTH ? `${trimmed.slice(0, PREVIEW_MAX_LENGTH)}…` : trimmed;
  }
  switch (input.type) {
    case 'IMAGE':
      return '📷 Photo';
    case 'VIDEO':
      return '🎥 Video';
    case 'DOCUMENT':
      return '📄 Document';
    case 'AUDIO':
      return '🎤 Audio';
    case 'INTERACTIVE':
      return '[Interactive message]';
    default:
      return '[Message]';
  }
}

export type ConversationRow = {
  id: string;
  organizationId: string;
  phoneNumberId: string;
  contactPhone: string;
  lastMessageAt: Date;
  lastMessagePreview: string | null;
  lastMessageDirection: MessageDirection | null;
  lastInboundAt: Date | null;
  unreadCount: number;
};

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function toConversationSummaryDto(row: ConversationRow): ConversationSummaryDto {
  const canSendFreeText =
    row.lastInboundAt !== null && Date.now() - row.lastInboundAt.getTime() < TWENTY_FOUR_HOURS_MS;

  return {
    id: row.id,
    phoneNumberId: row.phoneNumberId,
    contactPhone: row.contactPhone,
    lastMessageAt: row.lastMessageAt.toISOString(),
    lastMessagePreview: row.lastMessagePreview,
    lastMessageDirection: row.lastMessageDirection,
    unreadCount: row.unreadCount,
    canSendFreeText,
  };
}

const conversationRowSelect = {
  id: true,
  organizationId: true,
  phoneNumberId: true,
  contactPhone: true,
  lastMessageAt: true,
  lastMessagePreview: true,
  lastMessageDirection: true,
  lastInboundAt: true,
  unreadCount: true,
} as const;

export async function upsertConversationForInbound(input: {
  organizationId: string;
  phoneNumberId: string;
  contactPhone: string;
  occurredAt: Date;
  preview: string | null;
}): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  await prisma.conversation.upsert({
    where: {
      organizationId_phoneNumberId_contactPhone: {
        organizationId: input.organizationId,
        phoneNumberId: input.phoneNumberId,
        contactPhone: input.contactPhone,
      },
    },
    create: {
      organizationId: input.organizationId,
      phoneNumberId: input.phoneNumberId,
      contactPhone: input.contactPhone,
      lastMessageAt: input.occurredAt,
      lastInboundAt: input.occurredAt,
      lastMessageDirection: 'INBOUND',
      lastMessagePreview: input.preview,
      unreadCount: 1,
    },
    update: {
      lastMessageAt: input.occurredAt,
      lastInboundAt: input.occurredAt,
      lastMessageDirection: 'INBOUND',
      lastMessagePreview: input.preview,
      unreadCount: { increment: 1 },
    },
  });
}

export async function upsertConversationForOutbound(input: {
  organizationId: string;
  phoneNumberId: string;
  contactPhone: string;
  occurredAt: Date;
  preview: string | null;
}): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  await prisma.conversation.upsert({
    where: {
      organizationId_phoneNumberId_contactPhone: {
        organizationId: input.organizationId,
        phoneNumberId: input.phoneNumberId,
        contactPhone: input.contactPhone,
      },
    },
    create: {
      organizationId: input.organizationId,
      phoneNumberId: input.phoneNumberId,
      contactPhone: input.contactPhone,
      lastMessageAt: input.occurredAt,
      lastMessageDirection: 'OUTBOUND',
      lastMessagePreview: input.preview,
      unreadCount: 0,
    },
    update: {
      lastMessageAt: input.occurredAt,
      lastMessageDirection: 'OUTBOUND',
      lastMessagePreview: input.preview,
    },
  });
}

export async function listConversationsByOrganization(input: {
  organizationId: string;
  page: number;
  limit: number;
  unreadOnly?: boolean;
}): Promise<{ items: ConversationSummaryDto[]; total: number }> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const where = {
    organizationId: input.organizationId,
    ...(input.unreadOnly ? { unreadCount: { gt: 0 } } : {}),
  };

  const skip = (input.page - 1) * input.limit;

  const [rows, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      skip,
      take: input.limit,
      select: conversationRowSelect,
    }),
    prisma.conversation.count({ where }),
  ]);

  return {
    items: rows.map((row) => toConversationSummaryDto(row)),
    total,
  };
}

export async function findConversationForOrg(
  organizationId: string,
  conversationId: string,
): Promise<ConversationRow | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  return prisma.conversation.findFirst({
    where: { id: conversationId, organizationId },
    select: conversationRowSelect,
  });
}

export async function requireConversationForOrg(
  organizationId: string,
  conversationId: string,
): Promise<ConversationRow> {
  const conversation = await findConversationForOrg(organizationId, conversationId);
  if (!conversation) {
    throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
  }
  return conversation;
}

export async function markConversationRead(
  organizationId: string,
  conversationId: string,
): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  await prisma.conversation.updateMany({
    where: { id: conversationId, organizationId },
    data: { unreadCount: 0 },
  });
}

const threadMessageSelect = {
  id: true,
  direction: true,
  type: true,
  status: true,
  bodyText: true,
  metaTemplateName: true,
  components: true,
  errorCode: true,
  errorMessage: true,
  createdAt: true,
  sentAt: true,
  deliveredAt: true,
  readAt: true,
  failedAt: true,
} as const;

type ThreadMessageRow = {
  id: string;
  direction: MessageDirection;
  type: string;
  status: string;
  bodyText: string | null;
  metaTemplateName: string | null;
  components: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
};

function toThreadMessageDto(row: ThreadMessageRow): ConversationThreadMessageDto {
  return {
    id: row.id,
    direction: row.direction,
    type: row.type,
    status: row.status,
    bodyText: row.bodyText,
    metaTemplateName: row.metaTemplateName,
    components: row.components,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
  };
}

export async function listThreadMessages(input: {
  organizationId: string;
  phoneNumberId: string;
  contactPhone: string;
  page: number;
  limit: number;
}): Promise<{ items: ConversationThreadMessageDto[]; total: number }> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const where = {
    organizationId: input.organizationId,
    phoneNumberId: input.phoneNumberId,
    recipientPhone: input.contactPhone,
  };

  const skip = (input.page - 1) * input.limit;

  // Page backwards from the most recent message (desc), then reverse to ascending
  // for display — the standard "load older history" pagination trick for chat threads.
  const [rows, total] = await Promise.all([
    prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: input.limit,
      select: threadMessageSelect,
    }),
    prisma.message.count({ where }),
  ]);

  return {
    items: rows.reverse().map((row) => toThreadMessageDto(row as ThreadMessageRow)),
    total,
  };
}