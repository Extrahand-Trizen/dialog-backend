/**
 * One-off, idempotent backfill: renders and stores bodyText for existing outbound
 * TEMPLATE messages that don't have it yet, so the Inbox can show what was actually
 * sent instead of just "Template: name".
 *
 * Usage (from dialog-backend): npx ts-node --transpile-only scripts/backfillTemplateBodyText.ts
 */
import 'dotenv/config';
import { connectPrisma, getPrismaClient, disconnectPrisma } from '../src/infrastructure/prisma/client';
import { renderTemplateBodyTextFromComponents } from '../src/modules/messages/messages.meta';

async function main(): Promise<void> {
  await connectPrisma();
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized');
  }

  const rows = await prisma.message.findMany({
    where: { type: 'TEMPLATE', bodyText: null, templateVersionId: { not: null } },
    select: {
      id: true,
      components: true,
      templateVersion: { select: { components: true } },
    },
  });

  console.log(`Found ${rows.length} template message(s) missing bodyText`);

  let updated = 0;
  for (const row of rows) {
    const bodyText = renderTemplateBodyTextFromComponents(
      row.templateVersion?.components,
      row.components,
    );
    if (!bodyText) continue;

    await prisma.message.update({
      where: { id: row.id },
      data: { bodyText },
    });
    updated += 1;
  }

  console.log(`Backfill complete — updated ${updated} of ${rows.length}`);
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
