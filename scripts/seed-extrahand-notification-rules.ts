/**
 * Seed ExtraHand push → WhatsApp notification rules for Dialog.
 *
 * Matches APPROVED Meta templates (by name) to ExtraHand eventKeys and creates
 * enabled rules with variableMapping { "1": "title", "2": "body" }.
 *
 * Usage (from dialog-backend):
 *   npx tsx scripts/seed-extrahand-notification-rules.ts
 */
import 'dotenv/config';
import {
  connectPrisma,
  disconnectPrisma,
  getPrismaClient,
} from '../src/infrastructure/prisma/client';
import { createOrganizationNotificationRule } from '../src/modules/notificationRules/notificationRules.service';
import { findEnabledNotificationRuleByEventKey } from '../src/modules/notificationRules/notificationRules.repository';

const ORG_ID =
  process.env.DIALOG_ORGANIZATION_ID || 'be71c430-c43e-45cc-a03d-9159f37c771e';

/** Preferred Meta template name aliases (lowercase) per ExtraHand eventKey. */
const EVENT_TEMPLATE_ALIASES: Record<string, string[]> = {
  APPLICATION_ACCEPTED: [
    'extrahand_work_assigned',
    'work_assigned',
    'wa_work_assigned',
    'helper_work_assigned',
    'task_assigned',
  ],
  CUSTOMER_WELCOME: [
    'extrahand_customer_welcome',
    'customer_welcome',
    'wa_customer_welcome',
  ],
  HELPER_WELCOME: [
    'extrahand_helper_welcome',
    'helper_welcome',
    'wa_helper_welcome',
  ],
  APPLICATION_SUBMITTED: [
    'extrahand_offer_received',
    'offer_received',
    'wa_offer_received',
    'new_offer',
    'application_received',
  ],
  APPLICATION_REJECTED: [
    'application_rejected',
    'offer_rejected',
    'wa_application_rejected',
  ],
  TASK_COMPLETED: [
    'extrahand_work_completed_customer',
    'work_completed_customer',
    'wa_work_completed_customer',
    'work_completed',
    'task_completed',
  ],
  TASK_COMPLETED_TASKER: [
    'extrahand_work_completed_helper',
    'work_completed_helper',
    'wa_work_completed_helper',
    'helper_work_completed',
  ],
  TASK_REMINDER_24H: [
    'extrahand_work_reminder',
    'task_reminder',
    'wa_task_reminder',
    'work_reminder',
    'reminder',
  ],
  TASK_NEARBY: [
    'extrahand_nearby_work_skill_match',
    'work_near_you',
    'wa_nearby_work_skill_match',
    'nearby_work',
    'work_nearby',
  ],
  TASK_CREATED_RECOMMENDED: [
    'extrahand_nearby_work_skill_match',
    'work_near_you',
    'wa_nearby_work_skill_match',
    'recommended_work',
    'nearby_work',
  ],
  TASK_CREATED_KEYWORD: [
    'extrahand_nearby_work_skill_match',
    'work_near_you',
    'wa_nearby_work_skill_match',
    'keyword_work',
    'nearby_work',
  ],
  TASK_UPDATED: ['task_updated', 'wa_task_updated', 'work_updated'],
  HELPER_ON_THE_WAY: [
    'extrahand_work_starting_soon',
    'work_starting_soon',
    'work_starts_soon',
    'wa_work_starting_soon',
  ],
  REVIEW_REQUEST: ['review_request', 'wa_review_request', 'ask_for_review'],
  TASK_BUDGET_REVISED: [
    'budget_revised',
    'wa_budget_revised',
    'task_budget_revised',
    'budget_update',
  ],
  BUDGET_REVISION_RESPONSE: [
    'budget_revision_response',
    'budget_response',
    'budget_revised',
  ],
  NEGOTIATION_COUNTER: [
    'counter_offer',
    'wa_counter_offer_received',
    'negotiation_counter',
  ],
  NEGOTIATION_ACCEPTED: [
    'negotiation_accepted',
    'wa_negotiation_accepted',
    'offer_accepted',
  ],
  NEGOTIATION_REJECTED: [
    'negotiation_rejected',
    'offer_rejected',
    'application_rejected',
  ],
  TASK_CANCELLED_CUSTOMER: [
    'extrahand_work_cancelled_customer',
    'work_cancelled_customer',
    'wa_work_cancelled_customer',
  ],
  TASK_CANCELLED_HELPER: [
    'extrahand_work_cancelled_helper',
    'work_cancelled_helper',
    'wa_work_cancelled_helper',
  ],
};

const EVENT_MAPPINGS: Record<string, Record<string, string>> = {
  APPLICATION_ACCEPTED: { '1': 'taskTitle' },
  APPLICATION_SUBMITTED: { '1': 'applicantName', '2': 'taskTitle' },
  APPLICATION_REJECTED: { '1': 'taskTitle' },
  CUSTOMER_WELCOME: { '1': 'userName' },
  HELPER_WELCOME: { '1': 'userName' },
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
  TASK_UPDATED: { '1': 'taskTitle', '2': 'body' },
  HELPER_ON_THE_WAY: { '1': 'taskTitle', '2': 'scheduledLabel' },
  REVIEW_REQUEST: { '1': 'taskTitle' },
  TASK_BUDGET_REVISED: { '1': 'taskTitle', '2': 'body' },
  BUDGET_REVISION_RESPONSE: { '1': 'taskTitle', '2': 'body' },
  NEGOTIATION_COUNTER: { '1': 'applicantName', '2': 'taskTitle' },
  NEGOTIATION_ACCEPTED: { '1': 'taskTitle' },
  NEGOTIATION_REJECTED: { '1': 'taskTitle' },
  TASK_CANCELLED_CUSTOMER: { '1': 'taskTitle' },
  TASK_CANCELLED_HELPER: { '1': 'taskTitle' },
};

const DEFAULT_MAPPING = { '1': 'title', '2': 'body' };

function normalizeName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}

function pickTemplate(
  aliases: string[],
  templates: Array<{ id: string; metaTemplateName: string; metaStatus: string }>,
) {
  const approved = templates.filter((t) => t.metaStatus === 'APPROVED');
  for (const alias of aliases) {
    const want = normalizeName(alias);
    const hit = approved.find((t) => normalizeName(t.metaTemplateName) === want);
    if (hit) return hit;
  }
  for (const alias of aliases) {
    const want = normalizeName(alias);
    const hit = approved.find((t) => normalizeName(t.metaTemplateName).includes(want));
    if (hit) return hit;
  }
  return null;
}

async function main() {
  await connectPrisma();
  const prisma = getPrismaClient();
  if (!prisma) throw new Error('Prisma not initialized');

  const actor =
    (await prisma.user.findFirst({
      where: {
        isActive: true,
        memberships: { some: { organizationId: ORG_ID } },
      },
      select: { id: true, email: true },
      orderBy: { createdAt: 'asc' },
    })) ??
    (await prisma.user.findFirst({
      where: { isActive: true },
      select: { id: true, email: true },
      orderBy: { createdAt: 'asc' },
    }));

  if (!actor) {
    throw new Error('No Dialog user found to attribute rule creation');
  }

  const templates = await prisma.template.findMany({
    where: { organizationId: ORG_ID, deletedAt: null },
    select: { id: true, metaTemplateName: true, metaStatus: true, language: true },
    orderBy: { metaTemplateName: 'asc' },
  });

  console.log(`Org ${ORG_ID}`);
  console.log(`Actor ${actor.email ?? actor.id}`);
  console.log(`Templates found: ${templates.length}`);
  for (const t of templates) {
    console.log(`  [${t.metaStatus}] ${t.metaTemplateName} (${t.language}) id=${t.id}`);
  }

  const approved = templates.filter((t) => t.metaStatus === 'APPROVED');
  if (approved.length === 0) {
    throw new Error('No APPROVED templates found. Sync/approve templates in dialog first.');
  }

  const results: Array<{ eventKey: string; status: string; detail: string }> = [];

  for (const [eventKey, aliases] of Object.entries(EVENT_TEMPLATE_ALIASES)) {
    const existing = await findEnabledNotificationRuleByEventKey({
      organizationId: ORG_ID,
      eventKey,
    });
    if (existing) {
      results.push({
        eventKey,
        status: 'SKIP',
        detail: `enabled rule already exists → ${existing.template.metaTemplateName}`,
      });
      continue;
    }

    const template = pickTemplate(aliases, templates);
    if (!template) {
      results.push({
        eventKey,
        status: 'MISS',
        detail: `no APPROVED template matching: ${aliases.join(', ')}`,
      });
      continue;
    }

    try {
      const rule = await createOrganizationNotificationRule(ORG_ID, actor.id, {
        eventKey,
        name: `ExtraHand: ${eventKey}`,
        templateId: template.id,
        enabled: true,
        priority: 10,
        variableMapping: EVENT_MAPPINGS[eventKey] || DEFAULT_MAPPING,
      });
      results.push({
        eventKey,
        status: 'CREATED',
        detail: `${rule.template.metaTemplateName} (${rule.id})`,
      });
    } catch (err) {
      results.push({
        eventKey,
        status: 'ERROR',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log('\nRule seed results:');
  for (const r of results) {
    console.log(`  [${r.status}] ${r.eventKey} — ${r.detail}`);
  }

  const created = results.filter((r) => r.status === 'CREATED').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;
  const missed = results.filter((r) => r.status === 'MISS').length;
  console.log(`\nDone. created=${created} skipped=${skipped} missed=${missed}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
