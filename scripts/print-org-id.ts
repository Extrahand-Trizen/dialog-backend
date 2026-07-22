/**
 * Prints active Dialog organization id(s) for ExtraHand notification-service env.
 * Usage (from dialog-backend): npx tsx scripts/print-org-id.ts
 */
import 'dotenv/config';
import { connectPrisma, getPrismaClient, disconnectPrisma } from '../src/infrastructure/prisma/client';

async function main() {
  await connectPrisma();
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized');
  }

  const orgs = await prisma.organization.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true },
    take: 10,
    orderBy: { createdAt: 'asc' },
  });

  if (orgs.length === 0) {
    console.log('No active organizations found. Log into dialog-frontend and create/connect an org first.');
    return;
  }

  console.log('Active Dialog organizations:');
  for (const org of orgs) {
    console.log(`- ${org.name} (${org.slug})`);
    console.log(`  DIALOG_ORGANIZATION_ID=${org.id}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
