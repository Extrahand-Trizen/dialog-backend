import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { disconnectPrisma, getPrismaClient, isPrismaConfigured } from '../../infrastructure/prisma/client';
import { findLatestEventPayloadByCorrelationIdForOrg } from './messages.repository';

/**
 * Regression test for a real cross-tenant leak found during the Phase 4
 * isolation audit: correlationId is client-controlled (x-correlation-id
 * header, see middleware/requestLogger.ts) and NOT globally unique on
 * EventIngest, so an org-unscoped lookup by correlationId could return a
 * different organization's event payload. Requires a configured database
 * (POSTGRES_URI / POSTGRES_URI_DEV) — skipped otherwise.
 */
describe('messages isolation — correlationId lookups never cross tenants', () => {
  if (!isPrismaConfigured()) {
    it('skipped — no database configured', () => {});
    return;
  }

  const sharedCorrelationId = `isolation-test-${randomUUID()}`;
  let orgAId: string;
  let orgBId: string;

  before(async () => {
    const prisma = getPrismaClient()!;

    const orgA = await prisma.organization.create({
      data: { name: 'Isolation Test Org A', slug: `isolation-test-a-${randomUUID()}` },
    });
    const orgB = await prisma.organization.create({
      data: { name: 'Isolation Test Org B', slug: `isolation-test-b-${randomUUID()}` },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;

    // Org A ingests an event; Org B will later send a message reusing the
    // same client-chosen correlationId (e.g. a predictable order/task id).
    await prisma.eventIngest.create({
      data: {
        organizationId: orgAId,
        correlationId: sharedCorrelationId,
        eventKey: 'isolation_test_event',
        idempotencyKey: `isolation-test-idem-${randomUUID()}`,
        recipientPhone: '10000000000',
        payload: { taskId: 'ORG-A-CONFIDENTIAL-TASK-ID' },
      },
    });
  });

  after(async () => {
    const prisma = getPrismaClient()!;
    await prisma.eventIngest.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await disconnectPrisma();
  });

  it("returns Org A's own payload when Org A looks up its own correlationId", async () => {
    const payload = await findLatestEventPayloadByCorrelationIdForOrg(orgAId, sharedCorrelationId);
    assert.equal(payload?.taskId, 'ORG-A-CONFIDENTIAL-TASK-ID');
  });

  it("returns nothing for Org B on the same correlationId — the leak this test guards against", async () => {
    const payload = await findLatestEventPayloadByCorrelationIdForOrg(orgBId, sharedCorrelationId);
    assert.equal(payload, null);
  });
});
