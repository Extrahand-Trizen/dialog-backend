import { createHmac } from 'crypto';
import { decryptField } from '../../infrastructure/encryption/fieldCrypto';
import logger from '../../infrastructure/logging/logger';
import {
  findMessageWebhookPayload,
  findOutboundWebhookSecrets,
} from './outboundWebhooks.repository';
import type { OutboundWebhookEventType, OutboundWebhookPayload } from './outboundWebhooks.schemas';

const WEBHOOK_TIMEOUT_MS = 10_000;

function signPayload(body: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${digest}`;
}

export async function deliverOutboundWebhook(input: {
  organizationId: string;
  messageId: string;
  event: OutboundWebhookEventType;
}): Promise<void> {
  const config = await findOutboundWebhookSecrets(input.organizationId);
  if (!config) {
    return;
  }

  const message = await findMessageWebhookPayload(input.messageId);
  if (!message || message.organizationId !== input.organizationId) {
    logger.warn('Outbound webhook skipped — message not found', {
      messageId: input.messageId,
      organizationId: input.organizationId,
    });
    return;
  }

  const payload: OutboundWebhookPayload = {
    event: input.event,
    timestamp: new Date().toISOString(),
    data: {
      messageId: input.messageId,
      idempotencyKey: message.correlationId,
      template: message.metaTemplateName,
      to: message.recipientPhone,
      status: message.status,
      metaMessageId: message.metaMessageId,
      errorCode: message.errorCode,
      errorMessage: message.errorMessage,
    },
  };

  const body = JSON.stringify(payload);
  const secret = decryptField(config.secretEnc);
  const signature = signPayload(body, secret);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TrizenDialog-Webhook/1.0',
        'X-TrizenDialog-Event': input.event,
        'X-TrizenDialog-Signature': signature,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      logger.warn('Outbound webhook delivery failed', {
        organizationId: input.organizationId,
        messageId: input.messageId,
        event: input.event,
        status: response.status,
        body: text.slice(0, 500),
      });
      throw new Error(`Webhook returned ${response.status}`);
    }

    logger.info('Outbound webhook delivered', {
      organizationId: input.organizationId,
      messageId: input.messageId,
      event: input.event,
    });
  } finally {
    clearTimeout(timeout);
  }
}
