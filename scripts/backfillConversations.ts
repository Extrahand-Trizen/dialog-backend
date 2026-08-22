/**
 * One-off, idempotent backfill: seeds Conversation rows from existing Message
 * history so pre-existing contacts aren't invisible in the inbox until their
 * next message. Safe to re-run — uses upsert, and always sets unreadCount to 0
 * (historical unread state is not reconstructible, so it's not guessed at).
 *
 * Usage (from dialog-backend): npx ts-node --transpile-only scripts/backfillConversations.ts
 */
import 'dotenv/config';
import { connectPrisma, getPrismaClient, disconnectPrisma } from '../src/infrastructure/prisma/client';

const PREVIEW_MAX_LENGTH = 120;

function buildPreview(bodyText: string | null, type: string): string | null {
  if (bodyText && bodyText.trim().length > 0) {
    const trimmed = bodyText.trim();
    return trimmed.length > PREVIEW_MAX_LENGTH ? `${trimmed.slice(0, PREVIEW_MAX_LENGTH)}…` : trimmed;
  }
  switch (type) {
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
    case 'TEMPLATE':
      return null;
    default:
      return '[Message]';
  }
}

async function main(): Promise<void> {
  await connectPrisma();
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized');
  }

  type GroupRow = {
    organizationId: string;
    phoneNumberId: string;
    recipientPhone: string;
  };

  const groups = await prisma.message.groupBy({
    by: ['organizationId', 'phoneNumberId', 'recipientPhone'],
  });

  console.log(`Found ${groups.length} distinct conversation(s) to backfill`);

  let created = 0;
  let updated = 0;

  for (const group of groups as GroupRow[]) {
    const lastMessage = await prisma.message.findFirst({
      where: {
        organizationId: group.organizationId,
        phoneNumberId: group.phoneNumberId,
        recipientPhone: group.recipientPhone,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        direction: true,
        type: true,
        bodyText: true,
        metaTemplateName: true,
      },
    });

    if (!lastMessage) {
      continue;
    }

    const lastInbound = await prisma.message.findFirst({
      where: {
        organizationId: group.organizationId,
        phoneNumberId: group.phoneNumberId,
        recipientPhone: group.recipientPhone,
        direction: 'INBOUND',
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const preview =
      lastMessage.type === 'TEMPLATE' && lastMessage.metaTemplateName
        ? `Template: ${lastMessage.metaTemplateName}`
        : buildPreview(lastMessage.bodyText, lastMessage.type);

    const result = await prisma.conversation.upsert({
      where: {
        organizationId_phoneNumberId_contactPhone: {
          organizationId: group.organizationId,
          phoneNumberId: group.phoneNumberId,
          contactPhone: group.recipientPhone,
        },
      },
      create: {
        organizationId: group.organizationId,
        phoneNumberId: group.phoneNumberId,
        contactPhone: group.recipientPhone,
        lastMessageAt: lastMessage.createdAt,
        lastMessagePreview: preview,
        lastMessageDirection: lastMessage.direction,
        lastInboundAt: lastInbound?.createdAt ?? null,
        unreadCount: 0,
      },
      update: {
        lastMessageAt: lastMessage.createdAt,
        lastMessagePreview: preview,
        lastMessageDirection: lastMessage.direction,
        lastInboundAt: lastInbound?.createdAt ?? null,
      },
      select: { createdAt: true, updatedAt: true },
    });

    if (result.createdAt.getTime() === result.updatedAt.getTime()) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  console.log(`Backfill complete — created ${created}, updated ${updated}`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown backfill error';
    console.error('Backfill failed:', message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
