import { EventBus } from '../../infrastructure/eventBus/EventBus';
import logger from '../../infrastructure/logging/logger';
import { updateMessageFromStatusWebhook, type MessageStatus } from '../messages/messages.repository';
import {
  mapMessageStatusToWebhookEvent,
  scheduleOutboundWebhook,
} from '../outboundWebhooks';
import { mapMetaQualityRating } from '../whatsapp/whatsapp.meta';
import { updatePhoneNumberFromQualityWebhook } from '../whatsapp/whatsapp.repository';
import {
  extractMessageStatusUpdates,
  extractPhoneQualityUpdates,
  extractTemplateStatusEvent,
} from './webhookPayload';
import {
  markWebhookEventFailed,
  markWebhookEventProcessed,
  markWebhookEventProcessing,
  requireWebhookEventById,
} from './webhooks.repository';

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

export async function processWebhookEvent(webhookEventId: string): Promise<void> {
  await markWebhookEventProcessing(webhookEventId);

  const event = await requireWebhookEventById(webhookEventId);
  let linkedCorrelationId = event.correlationId;

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

    for (const qualityUpdate of extractPhoneQualityUpdates(payload)) {
      await updatePhoneNumberFromQualityWebhook({
        metaPhoneNumberId: qualityUpdate.metaPhoneNumberId,
        qualityRating: qualityUpdate.qualityRating
          ? mapMetaQualityRating(qualityUpdate.qualityRating)
          : undefined,
        messagingTier: qualityUpdate.messagingTier ?? null,
      });
    }

    if (event.eventType === 'MESSAGE_TEMPLATE_STATUS_UPDATE') {
      const templateEvent = extractTemplateStatusEvent(payload);
      if (templateEvent?.event === 'APPROVED') {
        await EventBus.emit('TEMPLATE_APPROVED', {
          webhookEventId,
          organizationId: event.organizationId,
          metaWabaId: event.metaWabaId,
          templateId: templateEvent.templateId,
          correlationId: linkedCorrelationId,
        });
      } else if (templateEvent?.event === 'REJECTED') {
        await EventBus.emit('TEMPLATE_REJECTED', {
          webhookEventId,
          organizationId: event.organizationId,
          metaWabaId: event.metaWabaId,
          templateId: templateEvent.templateId,
          rejectionReason: templateEvent.rejectionReason,
          correlationId: linkedCorrelationId,
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
