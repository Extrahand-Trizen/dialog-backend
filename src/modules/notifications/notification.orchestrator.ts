import logger from '../../infrastructure/logging/logger';
import { ValidationError } from '../../shared/errors/AppError';
import { buildTemplateComponentsFromMapping } from '../messages/messages.meta';
import {
  enqueueStagedMessageSend,
  stageOutboundTemplateMessage,
} from '../messages/messages.service';
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
      metaComponents = buildTemplateComponentsFromMapping(rule.variableMapping, event.payload);
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

    const { messageId } = await stageOutboundTemplateMessage({
      organizationId: event.organizationId,
      phoneNumberId: phone.id,
      recipientPhone: event.recipientPhone,
      correlationId: event.correlationId,
      templateVersionId: template.templateVersionId,
      metaTemplateName: template.metaTemplateName,
      metaComponents,
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
