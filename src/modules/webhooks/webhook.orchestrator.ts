import logger from '../../infrastructure/logging/logger';
import {
  createInboundMessageFromWebhook,
  updateMessageFromStatusWebhook,
  type MessageStatus,
} from '../messages/messages.repository';
import {
  mapMessageStatusToWebhookEvent,
  scheduleOutboundWebhook,
} from '../outboundWebhooks';
import { applyTemplateWebhookStatus, mapTemplateWebhookEvent } from '../templates/template.orchestrator';
import { mapMetaQualityRating } from '../whatsapp/whatsapp.meta';
import {
  findPhoneNumberWithOrganizationByMetaId,
  updatePhoneNumberFromQualityWebhook,
} from '../whatsapp/whatsapp.repository';
import {
  extractInboundMessages,
  extractMessageStatusUpdates,
  extractPhoneQualityUpdates,
  extractTemplateStatusUpdates,
} from './webhookPayload';
import {
  markWebhookEventFailed,
  markWebhookEventProcessed,
  markWebhookEventProcessing,
  requireWebhookEventById,
} from './webhooks.repository';
import type { MessageType } from '@prisma/client';

function mapMetaDeliveryStatus(status: string): MessageStatus | null {
  switch (status.toLowerCase()) {
    case 'sent':
      return 'SENT';
    case 'delivered':
      return 'DELIVERED';
    case 'read':
      return 'READ';
    case 'failed':
      return 'FAILED';
    default:
      return null;
  }
}

function mapInboundMessageType(messageType: string): MessageType {
  switch (messageType) {
    case 'TEXT':
    case 'IMAGE':
    case 'VIDEO':
    case 'DOCUMENT':
    case 'AUDIO':
    case 'INTERACTIVE':
    case 'UNKNOWN':
      return messageType;
    default:
      return 'UNKNOWN';
  }
}

export async function processWebhookEvent(webhookEventId: string): Promise<void> {
  await markWebhookEventProcessing(webhookEventId);

  const event = await requireWebhookEventById(webhookEventId);
  let linkedCorrelationId = event.correlationId;
  const organizationId = event.organizationId;

  try {
    const payload = event.payload;

    for (const statusUpdate of extractMessageStatusUpdates(payload)) {
      const mappedStatus = mapMetaDeliveryStatus(statusUpdate.status);
      if (!mappedStatus) {
        continue;
      }

      const timestampSeconds = statusUpdate.timestamp
        ? Number.parseInt(statusUpdate.timestamp, 10)
        : undefined;

      const result = await updateMessageFromStatusWebhook({
        metaMessageId: statusUpdate.id,
        status: mappedStatus,
        timestampSeconds: Number.isFinite(timestampSeconds) ? timestampSeconds : undefined,
        errorCode: statusUpdate.errorCode,
        errorMessage: statusUpdate.errorMessage,
        pricingCategory: statusUpdate.pricingCategory,
        pricingModel: statusUpdate.pricingModel,
        billable: statusUpdate.billable,
        metaConversationId: statusUpdate.metaConversationId,
        rawStatusPayload: {
          id: statusUpdate.id,
          status: statusUpdate.status,
          timestamp: statusUpdate.timestamp,
          recipient_id: statusUpdate.recipientId,
        },
      });

      if (result?.correlationId) {
        linkedCorrelationId = result.correlationId;
      }

      if (result) {
        const webhookEvent = mapMessageStatusToWebhookEvent(result.status);
        if (webhookEvent) {
          void scheduleOutboundWebhook({
            organizationId: result.organizationId,
            messageId: result.messageId,
            event: webhookEvent,
          });
        }
      }
    }

    for (const inbound of extractInboundMessages(payload)) {
      const phone = await findPhoneNumberWithOrganizationByMetaId(inbound.metaPhoneNumberId);
      if (!phone) {
        logger.warn('Inbound message webhook skipped — phone number not found', {
          metaPhoneNumberId: inbound.metaPhoneNumberId,
          metaMessageId: inbound.metaMessageId,
        });
        continue;
      }

      await createInboundMessageFromWebhook({
        organizationId: phone.organizationId,
        phoneNumberId: phone.phoneNumberId,
        metaMessageId: inbound.metaMessageId,
        customerPhone: inbound.customerPhone,
        messageType: mapInboundMessageType(inbound.messageType),
        bodyText: inbound.bodyText,
        rawPayload: inbound.rawPayload,
      });
    }

    for (const qualityUpdate of extractPhoneQualityUpdates(payload)) {
      await updatePhoneNumberFromQualityWebhook({
        metaPhoneNumberId: qualityUpdate.metaPhoneNumberId,
        qualityRating: qualityUpdate.qualityRating
          ? mapMetaQualityRating(qualityUpdate.qualityRating)
          : undefined,
        messagingTier: qualityUpdate.messagingTier ?? null,
      });
    }

    if (organizationId) {
      for (const templateUpdate of extractTemplateStatusUpdates(payload)) {
        const metaStatus = mapTemplateWebhookEvent(templateUpdate.event);
        if (metaStatus === 'UNKNOWN') {
          logger.info('Ignoring unmapped template webhook event', {
            event: templateUpdate.event,
            metaTemplateId: templateUpdate.metaTemplateId,
            metaTemplateName: templateUpdate.metaTemplateName,
          });
          continue;
        }

        await applyTemplateWebhookStatus({
          organizationId,
          metaWabaId: event.metaWabaId ?? '',
          metaTemplateId: templateUpdate.metaTemplateId,
          metaTemplateName: templateUpdate.metaTemplateName,
          language: templateUpdate.language,
          metaStatus,
          rejectionReason: templateUpdate.rejectionReason ?? undefined,
          rawWebhookPayload: templateUpdate.rawValue,
          correlationId: linkedCorrelationId ?? undefined,
        });
      }
    }

    await markWebhookEventProcessed(webhookEventId, linkedCorrelationId);

    logger.info('Webhook event processed', {
      webhookEventId,
      correlationId: linkedCorrelationId,
      eventType: event.eventType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed';
    await markWebhookEventFailed(webhookEventId, message);
    logger.error('Webhook event processing failed', {
      webhookEventId,
      correlationId: event.correlationId,
      message,
    });
    throw error;
  }
}
