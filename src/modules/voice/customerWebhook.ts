import logger from '../../infrastructure/logging/logger';
import { getPrismaClient } from '../../infrastructure/prisma/client';

const CUSTOMER_EVENTS = new Set([
  'call.initiated',
  'call.ringing',
  'call.answered',
  'call.completed',
  'call.failed',
  'call.busy',
  'call.no_answer',
  'call.ended',
  'recording.available',
]);

export async function dispatchCustomerCallWebhook(
  virtualNumberId: string | null | undefined,
  payload: {
    event: string;
    callId: string;
    virtualNumber?: string;
    direction?: string;
    status?: string;
    durationSeconds?: number | null;
  },
): Promise<void> {
  if (!virtualNumberId || !CUSTOMER_EVENTS.has(payload.event)) return;
  const db = getPrismaClient();
  if (!db) return;
  const number = await db.virtualNumber.findUnique({ where: { id: virtualNumberId } });
  if (!number?.webhookUrl) return;
  try {
    await fetch(number.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: payload.event,
        callId: payload.callId,
        virtualNumber: payload.virtualNumber,
        direction: payload.direction,
        status: payload.status,
        durationSeconds: payload.durationSeconds ?? undefined,
      }),
    });
  } catch (error) {
    logger.warn('Voice webhook delivery failed', {
      virtualNumberId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
