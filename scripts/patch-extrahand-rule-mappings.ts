/**
 * Patch variableMapping on ExtraHand notification rules to match Meta templates.
 * Usage: npx tsx scripts/patch-extrahand-rule-mappings.ts
 */
import 'dotenv/config';
import {
  connectPrisma,
  disconnectPrisma,
  getPrismaClient,
} from '../src/infrastructure/prisma/client';

const ORG_ID =
  process.env.DIALOG_ORGANIZATION_ID || 'be71c430-c43e-45cc-a03d-9159f37c771e';

const MAPS: Record<string, Record<string, string>> = {
  APPLICATION_ACCEPTED: { '1': 'taskTitle' },
  APPLICATION_SUBMITTED: { '1': 'applicantName', '2': 'taskTitle' },
  TASK_COMPLETED: { '1': 'taskTitle' },
  TASK_COMPLETED_TASKER: { '1': 'taskTitle' },
  TASK_REMINDER_24H: { '1': 'taskTitle', '2': 'scheduledLabel' },
  TASK_NEARBY: { '1': 'taskTitle', '2': 'categoryLabel', '3': 'locationLabel' },
  TASK_CREATED_RECOMMENDED: {
    '1': 'taskTitle',
    '2': 'categoryLabel',
    '3': 'locationLabel',
  },
  TASK_CREATED_KEYWORD: {
    '1': 'taskTitle',
    '2': 'categoryLabel',
    '3': 'locationLabel',
  },
};

async function main() {
  await connectPrisma();
  const prisma = getPrismaClient();
  if (!prisma) throw new Error('Prisma not initialized');

  for (const [eventKey, variableMapping] of Object.entries(MAPS)) {
    const result = await prisma.notificationRule.updateMany({
      where: { organizationId: ORG_ID, eventKey, deletedAt: null },
      data: { variableMapping },
    });
    console.log(`[${result.count ? 'OK' : 'MISS'}] ${eventKey} → ${JSON.stringify(variableMapping)}`);
  }

  const rules = await prisma.notificationRule.findMany({
    where: { organizationId: ORG_ID, deletedAt: null, enabled: true },
    include: { template: { select: { metaTemplateName: true } } },
    orderBy: { eventKey: 'asc' },
  });
  console.log('\nEnabled rules:');
  for (const r of rules) {
    console.log(
      `  ${r.eventKey} → ${r.template.metaTemplateName} mapping=${JSON.stringify(r.variableMapping)}`,
    );
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
