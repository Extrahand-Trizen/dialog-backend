/**
 * Inspect WABA subscribed_apps after resubscribe.
 * Usage: npx ts-node --transpile-only scripts/checkWabaSubscriptions.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { decryptField } from '../src/infrastructure/encryption/fieldCrypto';
import { validateEnv } from '../src/config/env';

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URI });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const env = validateEnv();
  const version = env.META_API_VERSION || 'v23.0';
  const accounts = await prisma.whatsAppAccount.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, metaWabaId: true, accessTokenEnc: true },
  });

  for (const account of accounts) {
    const token = decryptField(account.accessTokenEnc);
    const url = `https://graph.facebook.com/${version}/${account.metaWabaId}/subscribed_apps`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.text();
    console.log('---');
    console.log('account', account.name, account.metaWabaId);
    console.log('http', res.status);
    console.log(body.slice(0, 800));
  }

  // Probe production webhook verify (GET challenge style won't work without params)
  const health = await fetch('https://wa-dialog-backend.backend.extrahand.in/api/v1/health');
  console.log('---');
  console.log('production health', health.status);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
