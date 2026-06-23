import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getPostgresConnectionTarget, getPostgresUri } from '../src/config/env';
import { seedAdmin } from '../prisma/seed';

async function main(): Promise<void> {
  const connectionString = getPostgresUri();
  if (!connectionString) {
    throw new Error('No Postgres URI configured — set POSTGRES_URI or enable USE_DEV_DATABASE with POSTGRES_URI_DEV');
  }

  console.log(`Seeding admin (postgres target: ${getPostgresConnectionTarget()})`);

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    await seedAdmin(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('seedAdmin failed:', message);
  process.exit(1);
});
