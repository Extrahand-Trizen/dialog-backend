/**
 * One-off, idempotent cleanup: merges Conversation rows for the same real contact that
 * got split by inconsistent phone-number formats (with/without country code) — a bug in
 * upsertConversationForOutbound that's now fixed for new activity, but existing duplicate
 * rows need a one-time consolidation.
 *
 * Groups by (organizationId, phoneNumberId, last 10 digits of contactPhone), keeps the
 * row with the most recent lastMessageAt as canonical, sums unreadCount into it, and
 * deletes the rest. Message rows are untouched (thread queries already fuzzy-match by
 * last-10-digits, so history isn't affected).
 *
 * Usage (from dialog-backend): npx ts-node --transpile-only scripts/mergeDuplicateConversations.ts
 */
import 'dotenv/config';
import { connectPrisma, getPrismaClient, disconnectPrisma } from '../src/infrastructure/prisma/client';

function last10Digits(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

async function main(): Promise<void> {
  await connectPrisma();
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized');
  }

  const all = await prisma.conversation.findMany({
    select: {
      id: true,
      organizationId: true,
      phoneNumberId: true,
      contactPhone: true,
      lastMessageAt: true,
      lastMessageDirection: true,
      lastMessagePreview: true,
      lastInboundAt: true,
      unreadCount: true,
    },
  });

  const groups = new Map<string, typeof all>();
  for (const row of all) {
    const last10 = last10Digits(row.contactPhone);
    if (!last10) continue;
    const key = `${row.organizationId}:${row.phoneNumberId}:${last10}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const duplicateGroups = [...groups.values()].filter((group) => group.length > 1);
  console.log(`Found ${duplicateGroups.length} contact(s) split across multiple conversations`);

  let merged = 0;
  for (const group of duplicateGroups) {
    const sorted = [...group].sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
    const canonical = sorted[0];
    const duplicates = sorted.slice(1);

    const totalUnread = group.reduce((sum, row) => sum + row.unreadCount, 0);
    const latestInbound = group
      .map((row) => row.lastInboundAt)
      .filter((date): date is Date => date !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    await prisma.conversation.update({
      where: { id: canonical.id },
      data: {
        unreadCount: totalUnread,
        ...(latestInbound ? { lastInboundAt: latestInbound } : {}),
      },
    });

    await prisma.conversation.deleteMany({
      where: { id: { in: duplicates.map((row) => row.id) } },
    });

    console.log(
      `Merged ${duplicates.length} duplicate(s) for contact ending in ...${last10Digits(canonical.contactPhone)} → kept ${canonical.id} (unread: ${totalUnread})`,
    );
    merged += 1;
  }

  console.log(`Merge complete — consolidated ${merged} contact(s)`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown merge error';
    console.error('Merge failed:', message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
