/**
 * One-off, idempotent backfill: refreshes Conversation.lastMessagePreview for rows still
 * showing the old "Template: name" label, now that Message.bodyText has real rendered
 * content (see backfillTemplateBodyText.ts, which must run first).
 *
 * Usage (from dialog-backend): npx ts-node --transpile-only scripts/backfillConversationPreviews.ts
 */
import 'dotenv/config';
import { connectPrisma, getPrismaClient, disconnectPrisma } from '../src/infrastructure/prisma/client';

const PREVIEW_MAX_LENGTH = 120;

async function main(): Promise<void> {
  await connectPrisma();
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized');
  }

  const stale = await prisma.conversation.findMany({
    where: { lastMessagePreview: { startsWith: 'Template: ' } },
    select: { id: true, organizationId: true, phoneNumberId: true, contactPhone: true },
  });

  console.log(`Found ${stale.length} conversation(s) with a stale template preview`);

  let updated = 0;
  for (const conversation of stale) {
    const latest = await prisma.message.findFirst({
      where: {
        organizationId: conversation.organizationId,
        phoneNumberId: conversation.phoneNumberId,
        recipientPhone: conversation.contactPhone,
        type: 'TEMPLATE',
        bodyText: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { bodyText: true },
    });

    if (!latest?.bodyText) continue;

    const trimmed = latest.bodyText.trim();
    const preview =
      trimmed.length > PREVIEW_MAX_LENGTH ? `${trimmed.slice(0, PREVIEW_MAX_LENGTH)}…` : trimmed;

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessagePreview: preview },
    });
    updated += 1;
  }

  console.log(`Backfill complete — updated ${updated} of ${stale.length}`);
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
