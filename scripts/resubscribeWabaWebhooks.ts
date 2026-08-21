/**
 * Re-subscribe each active WABA and force override_callback_uri to Dialog production.
 * Usage: npx ts-node --transpile-only scripts/resubscribeWabaWebhooks.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { decryptField } from '../src/infrastructure/encryption/fieldCrypto';
import { getMetaWhatsAppClient, getMetaWebhookSubscribeOptions } from '../src/infrastructure/meta';

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URI });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const subscribeOptions = getMetaWebhookSubscribeOptions();
  if (!subscribeOptions) {
    console.warn(
      'META_WEBHOOK_CALLBACK_URL + META_WEBHOOK_VERIFY_TOKEN not both set — subscribing without override.',
    );
  } else {
    console.log('Using webhook override:', subscribeOptions.overrideCallbackUri);
  }

  const accounts = await prisma.whatsAppAccount.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      metaWabaId: true,
      accessTokenEnc: true,
    },
  });

  if (accounts.length === 0) {
    console.log('No active WhatsApp accounts found.');
    return;
  }

  const metaClient = getMetaWhatsAppClient();
  let ok = 0;
  let failed = 0;

  for (const account of accounts) {
    try {
      const token = decryptField(account.accessTokenEnc);
      // Meta requires a plain WABA subscription (with messages field on the app)
      // before override_callback_uri can be set.
      await metaClient.subscribeToWaba(account.metaWabaId, token);
      if (subscribeOptions) {
        await metaClient.subscribeToWaba(account.metaWabaId, token, subscribeOptions);
      }
      ok += 1;
      console.log(`OK  waba=${account.metaWabaId} account=${account.id} name=${account.name}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `FAIL waba=${account.metaWabaId} account=${account.id} error=${message.slice(0, 240)}`,
      );
    }
  }

  console.log(`Done. subscribed=${ok} failed=${failed}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
