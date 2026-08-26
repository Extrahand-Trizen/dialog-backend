import logger from '../../infrastructure/logging/logger';
import { ValidationError } from '../../shared/errors/AppError';
import {
  buildTemplateComponentsFromMapping,
  coerceTemplateComponentsArray,
  normalizeRecipientPhone,
  outboundHasMediaHeader,
  renderTemplateBodyTextFromComponents,
  templateRequiresMediaHeader,
} from '../messages/messages.meta';
import {
  enqueueStagedMessageSend,
  stageOutboundTemplateMessage,
} from '../messages/messages.service';
import { buildMessagePreview, upsertConversationForOutbound } from '../conversations/conversations.repository';
import { getEnabledRuleForEvent } from '../notificationRules/notificationRules.service';
import { resolveTemplateForSend } from '../templates/templates.service';
import { resolvePhoneForNotification } from '../whatsapp/whatsapp.service';
import {
  createNotificationExecution,
  requireEventIngestById,
  updateEventIngestStatus,
} from './notifications.repository';

export async function processEventIngest(
  eventIngestId: string,
  options?: { executionSource?: 'EVENT' | 'INTERNAL' },
): Promise<void> {
  const executionSource = options?.executionSource ?? 'EVENT';
  const event = await requireEventIngestById(eventIngestId);

  if (event.status === 'PROCESSED' || event.status === 'SKIPPED' || event.status === 'FAILED') {
    return;
  }

  await updateEventIngestStatus({
    eventIngestId,
    status: 'PROCESSING',
  });

  try {
    const rule = await getEnabledRuleForEvent(event.organizationId, event.eventKey);
    if (!rule) {
      await createNotificationExecution({
        organizationId: event.organizationId,
        correlationId: event.correlationId,
        source: executionSource,
        eventIngestId: event.id,
        status: 'SKIPPED',
        skipReason: 'NO_MATCHING_RULE',
      });
      await updateEventIngestStatus({
        eventIngestId,
        status: 'SKIPPED',
      });
      return;
    }

    const template = await resolveTemplateForSend(
      event.organizationId,
      rule.templateId,
      rule.templateVersionId,
    );
    if (!template) {
      await createNotificationExecution({
        organizationId: event.organizationId,
        correlationId: event.correlationId,
        source: executionSource,
        eventIngestId: event.id,
        notificationRuleId: rule.id,
        ruleVersion: rule.version,
        status: 'FAILED',
        errorMessage: 'Template not available for send',
      });
      await updateEventIngestStatus({
        eventIngestId,
        status: 'FAILED',
        errorMessage: 'Template not available for send',
      });
      return;
    }

    const phone = await resolvePhoneForNotification(event.organizationId, rule.phoneNumberId);
    if (!phone) {
      await createNotificationExecution({
        organizationId: event.organizationId,
        correlationId: event.correlationId,
        source: executionSource,
        eventIngestId: event.id,
        notificationRuleId: rule.id,
        ruleVersion: rule.version,
        templateVersionId: template.templateVersionId,
        status: 'FAILED',
        errorMessage: 'No phone number configured for send',
      });
      await updateEventIngestStatus({
        eventIngestId,
        status: 'FAILED',
        errorMessage: 'No phone number configured for send',
      });
      return;
    }

    let metaComponents;
    try {
      metaComponents = buildTemplateComponentsFromMapping(
        rule.variableMapping,
        event.payload,
        template.components,
      );

      // Fail fast if IMAGE/VIDEO/DOCUMENT header is required but missing from staged payload.
      // Use coerce so string-json components still count (avoids body-only staging → Meta #132012).
      if (
        templateRequiresMediaHeader(template.components) &&
        !outboundHasMediaHeader(metaComponents)
      ) {
        throw new ValidationError(
          'Template requires a media header parameter but none was built — check header_media_url on the template',
          {
            componentCount: coerceTemplateComponentsArray(template.components)?.length ?? 0,
            stagedTypes: metaComponents.map((component) => component.type),
          },
        );
      }
    } catch (error) {
      const message =
        error instanceof ValidationError ? error.message : 'Variable mapping failed';
      await createNotificationExecution({
        organizationId: event.organizationId,
        correlationId: event.correlationId,
        source: executionSource,
        eventIngestId: event.id,
        notificationRuleId: rule.id,
        ruleVersion: rule.version,
        templateVersionId: template.templateVersionId,
        status: 'FAILED',
        errorMessage: message,
      });
      await updateEventIngestStatus({
        eventIngestId,
        status: 'FAILED',
        errorMessage: message,
      });
      return;
    }

    const bodyText = renderTemplateBodyTextFromComponents(template.components, metaComponents);

    const { messageId } = await stageOutboundTemplateMessage({
      organizationId: event.organizationId,
      phoneNumberId: phone.id,
      recipientPhone: event.recipientPhone,
      correlationId: event.correlationId,
      templateVersionId: template.templateVersionId,
      metaTemplateName: template.metaTemplateName,
      metaComponents,
      bodyText,
    });

    await createNotificationExecution({
      organizationId: event.organizationId,
      correlationId: event.correlationId,
      source: executionSource,
      eventIngestId: event.id,
      notificationRuleId: rule.id,
      ruleVersion: rule.version,
      templateVersionId: template.templateVersionId,
      messageId,
      status: 'QUEUED',
    });

    await enqueueStagedMessageSend(messageId, event.correlationId);

    await upsertConversationForOutbound({
      organizationId: event.organizationId,
      phoneNumberId: phone.id,
      contactPhone: normalizeRecipientPhone(event.recipientPhone),
      occurredAt: new Date(),
      preview: buildMessagePreview({ type: 'TEMPLATE', metaTemplateName: template.metaTemplateName, bodyText }),
    });

    await updateEventIngestStatus({
      eventIngestId,
      status: 'PROCESSED',
    });

    logger.info('Event ingest processed', {
      eventIngestId,
      correlationId: event.correlationId,
      messageId,
      eventKey: event.eventKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Event processing failed';
    await updateEventIngestStatus({
      eventIngestId,
      status: 'FAILED',
      errorMessage: message,
    });
    logger.error('Event ingest processing failed', {
      eventIngestId,
      correlationId: event.correlationId,
      message,
    });
    throw error;
  }
}
