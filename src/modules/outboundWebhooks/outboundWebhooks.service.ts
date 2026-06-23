import { encryptField } from '../../infrastructure/encryption/fieldCrypto';
import { enqueueOutboundWebhook } from '../../infrastructure/queues/queues';
import logger from '../../infrastructure/logging/logger';
import { deliverOutboundWebhook } from './outboundWebhooks.dispatch.service';
import {
  findOutboundWebhookConfig,
  patchOutboundWebhookConfig,
} from './outboundWebhooks.repository';
import type {
  OutboundWebhookConfigDto,
  OutboundWebhookEventType,
  UpsertOutboundWebhookInput,
} from './outboundWebhooks.schemas';

export async function getOrganizationOutboundWebhook(
  organizationId: string,
): Promise<OutboundWebhookConfigDto> {
  return findOutboundWebhookConfig(organizationId);
}

export async function upsertOrganizationOutboundWebhook(input: {
  organizationId: string;
  userId: string;
  body: UpsertOutboundWebhookInput;
}): Promise<OutboundWebhookConfigDto> {
  const secretEnc = input.body.secret ? encryptField(input.body.secret) : undefined;

  return patchOutboundWebhookConfig({
    organizationId: input.organizationId,
    url: input.body.url,
    secretEnc,
    enabled: input.body.enabled,
    userId: input.userId,
  });
}

export function mapMessageStatusToWebhookEvent(
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED',
): OutboundWebhookEventType | null {
  switch (status) {
    case 'QUEUED':
      return 'message.accepted';
    case 'SENT':
      return 'message.sent';
    case 'DELIVERED':
      return 'message.delivered';
    case 'READ':
      return 'message.read';
    case 'FAILED':
      return 'message.failed';
    default:
      return null;
  }
}

export async function scheduleOutboundWebhook(input: {
  organizationId: string;
  messageId: string;
  event: OutboundWebhookEventType;
}): Promise<void> {
  try {
    await enqueueOutboundWebhook(input);
  } catch {
    void deliverOutboundWebhook(input).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Outbound webhook failed';
      logger.warn('Outbound webhook direct delivery failed', {
        organizationId: input.organizationId,
        messageId: input.messageId,
        event: input.event,
        message,
      });
    });
  }
}
