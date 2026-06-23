import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getPostgresUri } from '../src/config/env';

const ORGANIZATION_SLUG = 'trizen';
const ORGANIZATION_NAME = 'Trizen';

export async function seedAdmin(prisma: PrismaClient): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('Skipping admin seed — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const organization = await prisma.organization.upsert({
    where: { slug: ORGANIZATION_SLUG },
    create: {
      name: ORGANIZATION_NAME,
      slug: ORGANIZATION_SLUG,
      isActive: true,
    },
    update: {
      name: ORGANIZATION_NAME,
      isActive: true,
    },
  });

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      isActive: true,
    },
    update: {
      passwordHash,
      isActive: true,
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id,
      },
    },
    create: {
      organizationId: organization.id,
      userId: user.id,
      role: 'ADMIN',
    },
    update: {
      role: 'ADMIN',
    },
  });

  console.log(`Seeded organization "${ORGANIZATION_SLUG}" and admin ${email}`);
}

async function main(): Promise<void> {
  const connectionString = getPostgresUri();
  if (!connectionString) {
    throw new Error('No Postgres URI configured — set POSTGRES_URI or enable USE_DEV_DATABASE with POSTGRES_URI_DEV');
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    await seedAdmin(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown seed error';
    console.error('Seed failed:', message);
    process.exit(1);
  });
}
