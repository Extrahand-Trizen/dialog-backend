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

function phoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function last10Digits(value: string): string | null {
  const digits = phoneDigits(value);
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

function contactKey(phoneNumberId: string, contactPhone: string): string | null {
  const last10 = last10Digits(contactPhone);
  if (!last10) return null;
  return `${phoneNumberId}:${last10}`;
}

export function toConversationSummaryDto(
  row: ConversationRow,
  inboundAtOverride?: Date | null,
): ConversationSummaryDto {
  const lastInboundAt = inboundAtOverride ?? row.lastInboundAt;
  const windowOpen =
    lastInboundAt !== null && Date.now() - lastInboundAt.getTime() < TWENTY_FOUR_HOURS_MS;
  const expiresAt =
    windowOpen && lastInboundAt
      ? new Date(lastInboundAt.getTime() + TWENTY_FOUR_HOURS_MS).toISOString()
      : null;

  return {
    id: row.id,
    phoneNumberId: row.phoneNumberId,
    contactPhone: row.contactPhone,
    lastMessageAt: row.lastMessageAt.toISOString(),
    lastMessagePreview: row.lastMessagePreview,
    lastMessageDirection: row.lastMessageDirection,
    unreadCount: row.unreadCount,
    canSendFreeText: windowOpen,
    lastInboundAt: lastInboundAt?.toISOString() ?? null,
    freeTextWindowExpiresAt: expiresAt,
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

  const last10 = last10Digits(input.contactPhone);
  const matches = last10
    ? await prisma.conversation.findMany({
        where: {
          organizationId: input.organizationId,
          phoneNumberId: input.phoneNumberId,
          contactPhone: { endsWith: last10 },
        },
        select: { id: true },
      })
    : [];

  if (matches.length > 0) {
    await prisma.conversation.updateMany({
      where: { id: { in: matches.map((row) => row.id) } },
      data: {
        lastMessageAt: input.occurredAt,
        lastInboundAt: input.occurredAt,
        lastMessageDirection: 'INBOUND',
        lastMessagePreview: input.preview,
        unreadCount: { increment: 1 },
      },
    });
    return;
  }

  await prisma.conversation.create({
    data: {
      organizationId: input.organizationId,
      phoneNumberId: input.phoneNumberId,
      contactPhone: phoneDigits(input.contactPhone) || input.contactPhone,
      lastMessageAt: input.occurredAt,
      lastInboundAt: input.occurredAt,
      lastMessageDirection: 'INBOUND',
      lastMessagePreview: input.preview,
      unreadCount: 1,
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

async function syncConversationsFromRecentMessages(organizationId: string): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) return;

  const recent = await prisma.message.findMany({
    where: { organizationId, recipientPhone: { not: '' } },
    orderBy: { createdAt: 'desc' },
    take: 250,
    select: {
      phoneNumberId: true,
      recipientPhone: true,
      createdAt: true,
      direction: true,
      type: true,
      bodyText: true,
      metaTemplateName: true,
    },
  });

  const seen = new Set<string>();
  for (const message of recent) {
    const phone = phoneDigits(message.recipientPhone) || message.recipientPhone;
    const key = `${message.phoneNumberId}:${phone}`;
    if (seen.has(key)) continue;
    seen.add(key);

    await upsertConversationFromMessage({
      organizationId,
      phoneNumberId: message.phoneNumberId,
      contactPhone: phone,
      occurredAt: message.createdAt,
      direction: message.direction,
      preview: buildMessagePreview({
        type: message.type,
        bodyText: message.bodyText,
        metaTemplateName: message.metaTemplateName,
      }),
    });
  }
}

async function upsertConversationFromMessage(input: {
  organizationId: string;
  phoneNumberId: string;
  contactPhone: string;
  occurredAt: Date;
  direction: MessageDirection;
  preview: string | null;
}): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) return;

    const existing = await prisma.conversation.findUnique({
    where: {
      organizationId_phoneNumberId_contactPhone: {
        organizationId: input.organizationId,
        phoneNumberId: input.phoneNumberId,
        contactPhone: input.contactPhone,
      },
    },
    select: { lastMessageAt: true },
  });

  if (existing && existing.lastMessageAt >= input.occurredAt) {
    return;
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
      lastMessageDirection: input.direction,
      lastMessagePreview: input.preview,
      lastInboundAt: input.direction === 'INBOUND' ? input.occurredAt : null,
      unreadCount: 0,
    },
    update: {
      lastMessageAt: input.occurredAt,
      lastMessageDirection: input.direction,
      lastMessagePreview: input.preview,
      ...(input.direction === 'INBOUND' ? { lastInboundAt: input.occurredAt } : {}),
    },
  });
}

async function loadRecentInboundTimes(organizationId: string): Promise<Map<string, Date>> {
  const prisma = getPrismaClient();
  const map = new Map<string, Date>();
  if (!prisma) return map;

  const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);
  const rows = await prisma.message.findMany({
    where: {
      organizationId,
      direction: 'INBOUND',
      createdAt: { gte: since },
    },
    select: { phoneNumberId: true, recipientPhone: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 800,
  });

  for (const row of rows) {
    const key = contactKey(row.phoneNumberId, row.recipientPhone);
    if (!key || map.has(key)) continue;
    map.set(key, row.createdAt);
  }
  return map;
}

export async function findLatestInboundForContact(input: {
  organizationId: string;
  phoneNumberId: string;
  contactPhone: string;
}): Promise<{ createdAt: Date; recipientPhone: string } | null> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  const last10 = last10Digits(input.contactPhone);
  const digits = phoneDigits(input.contactPhone);
  const row = await prisma.message.findFirst({
    where: {
      organizationId: input.organizationId,
      phoneNumberId: input.phoneNumberId,
      direction: 'INBOUND',
      OR: [
        { recipientPhone: input.contactPhone },
        { recipientPhone: digits },
        ...(last10 ? [{ recipientPhone: { endsWith: last10 } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, recipientPhone: true },
  });
  return row;
}

export async function listConversationsByOrganization(input: {
  organizationId: string;
  page: number;
  limit: number;
  unreadOnly?: boolean;
  search?: string;
}): Promise<{ items: ConversationSummaryDto[]; total: number }> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new InternalServerError('Database not configured', 'DATABASE_NOT_CONFIGURED');
  }

  await syncConversationsFromRecentMessages(input.organizationId);

  const searchDigits = input.search ? phoneDigits(input.search) : '';
  const where = {
    organizationId: input.organizationId,
    ...(input.unreadOnly ? { unreadCount: { gt: 0 } } : {}),
    ...(searchDigits
      ? { contactPhone: { contains: searchDigits } }
      : input.search
        ? { contactPhone: { contains: input.search, mode: 'insensitive' as const } }
        : {}),
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

  const inboundTimes = await loadRecentInboundTimes(input.organizationId);

  return {
    items: rows.map((row) => {
      const key = contactKey(row.phoneNumberId, row.contactPhone);
      const inboundAt = (key ? inboundTimes.get(key) : undefined) ?? row.lastInboundAt;
      return toConversationSummaryDto(row, inboundAt);
    }),
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

  const last10 = last10Digits(input.contactPhone);
  const digits = phoneDigits(input.contactPhone);
  const where = {
    organizationId: input.organizationId,
    phoneNumberId: input.phoneNumberId,
    OR: [
      { recipientPhone: input.contactPhone },
      { recipientPhone: digits },
      ...(last10 ? [{ recipientPhone: { endsWith: last10 } }] : []),
    ],
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