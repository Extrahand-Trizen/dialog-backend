import { validateEnv } from '../../config/env';
import { decryptField } from '../../infrastructure/encryption/fieldCrypto';
import { enqueueWebhookIngest } from '../../infrastructure/queues/queues';
import logger from '../../infrastructure/logging/logger';
import {
  UnauthorizedError,
  ValidationError,
} from '../../shared/errors/AppError';
import {
  findWhatsAppAccountByMetaWabaId,
  findWhatsAppAccountByWebhookVerifyToken,
} from '../whatsapp/whatsapp.repository';
import { processWebhookEvent } from './webhook.orchestrator';
import {
  detectWebhookEventType,
  extractMetaEventId,
  extractMetaWabaId,
  extractWebhookChangesForLog,
  parseWebhookPayload,
} from './webhookPayload';
import { verifyMetaWebhookSignature } from './webhookSignature';
import { insertWebhookEvent } from './webhooks.repository';

export type MetaWebhookVerifyQuery = {
  mode?: string;
  token?: string;
  challenge?: string;
};

export async function verifyMetaWebhookSubscription(
  query: MetaWebhookVerifyQuery,
): Promise<string> {
  const mode = query.mode;
  const token = query.token;
  const challenge = query.challenge;

  if (mode !== 'subscribe' || !token || !challenge) {
    throw new ValidationError('Invalid webhook verification request');
  }

  const envToken = validateEnv().META_WEBHOOK_VERIFY_TOKEN;
  if (envToken && token === envToken) {
    return challenge;
  }

  const accountMatches = await findWhatsAppAccountByWebhookVerifyToken(token);
  if (accountMatches) {
    return challenge;
  }

  throw new UnauthorizedError('Webhook verification failed', 'WEBHOOK_VERIFY_FAILED');
}

export async function ingestMetaWebhook(input: {
  rawBody: string;
  signatureHeader?: string;
  correlationId?: string;
}): Promise<void> {
  if (!input.rawBody) {
    throw new ValidationError('Empty webhook body');
  }

  let payload: unknown;
  try {
    payload = parseWebhookPayload(input.rawBody);
  } catch {
    throw new ValidationError('Invalid JSON webhook body');
  }

  const env = validateEnv();
  for (const change of extractWebhookChangesForLog(payload)) {
    logger.info('Meta webhook change received', {
      correlationId: input.correlationId,
      field: change.field,
      value: change.value,
      environment: env.NODE_ENV,
    });
  }

  const metaWabaId = extractMetaWabaId(payload);
  if (!metaWabaId) {
    throw new ValidationError('Unable to resolve Meta WABA id from webhook payload');
  }

  const account = await findWhatsAppAccountByMetaWabaId(metaWabaId);
  if (!account) {
    throw new UnauthorizedError('Unknown WhatsApp business account', 'UNKNOWN_WABA');
  }

  const appSecret = decryptField(account.appSecretEnc);
  if (
    !verifyMetaWebhookSignature(input.rawBody, input.signatureHeader, appSecret)
  ) {
    throw new UnauthorizedError('Invalid webhook signature', 'INVALID_WEBHOOK_SIGNATURE');
  }

  const metaEventId = extractMetaEventId(payload, input.rawBody);
  const eventType = detectWebhookEventType(payload);

  const { event, isDuplicate } = await insertWebhookEvent({
    organizationId: account.organizationId,
    metaWabaId,
    metaEventId,
    correlationId: input.correlationId,
    eventType,
    payload: payload as object,
  });

  if (isDuplicate && event.status === 'PROCESSED') {
    logger.info('Duplicate webhook ignored', {
      correlationId: input.correlationId,
      metaEventId,
      webhookEventId: event.id,
    });
    return;
  }

  try {
    await processWebhookEvent(event.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Inline webhook processing failed';
    logger.warn('Inline webhook processing failed — enqueueing for retry', {
      correlationId: input.correlationId,
      webhookEventId: event.id,
      message,
    });

    try {
      await enqueueWebhookIngest({
        webhookEventId: event.id,
        correlationId: input.correlationId,
      });
    } catch (enqueueError) {
      const enqueueMessage =
        enqueueError instanceof Error ? enqueueError.message : 'Queue enqueue failed';
      logger.error('Webhook processing and queue enqueue both failed', {
        correlationId: input.correlationId,
        webhookEventId: event.id,
        message: enqueueMessage,
      });
    }
  }
}
