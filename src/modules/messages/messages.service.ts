import { decryptField } from '../../infrastructure/encryption/fieldCrypto';
import { getMetaWhatsAppClient } from '../../infrastructure/meta';
import { enqueueMessageSend } from '../../infrastructure/queues/queues';
import { acquireWhatsAppSendSlot } from '../../infrastructure/redis/sendRateLimit';
import { ExternalServiceError, InternalServerError, ValidationError } from '../../shared/errors/AppError';
import { isRetryableSendError, MetaApiError } from '../../shared/errors/sendErrors';
import { scheduleOutboundWebhook } from '../outboundWebhooks';
import { findWhatsAppAccountSecrets } from '../whatsapp/whatsapp.repository';
import {
  buildHeaderComponentFromTemplate,
  buildUrlButtonComponentsFromTemplate,
  normalizeRecipientPhone,
  outboundHasMediaHeader,
  templateRequiresMediaHeader,
} from './messages.meta';
import {
  createOutboundTemplateMessage,
  createOutboundTextMessage,
  findLatestEventPayloadByCorrelationIdForOrg,
  findMessageCorrelationIdForOrg,
  findTemplateVersionComponentsForOrg,
  markMessageFailed,
  markMessageSent,
  requireMessageSendContext,
  updateMessageComponents,
} from './messages.repository';
import type { CreatedOutboundMessageDto, OutboundTemplateMessageInput } from './messages.schemas';
import type { MetaSendTemplateComponent } from '../../infrastructure/meta';
import logger from '../../infrastructure/logging/logger';
import { assertMessagePhoneSameOrganization } from '../whatsapp/phoneTenantSafety';

/**
 * Repair staged components that were saved without IMAGE header / URL button
 * (e.g. mid-deploy race). Meta error #132012 / #131008 otherwise.
 */
export async function repairOutboundTemplateComponents(
  organizationId: string,
  messageId: string,
  staged: MetaSendTemplateComponent[],
  templateVersionId: string | null | undefined,
): Promise<MetaSendTemplateComponent[]> {
  if (!templateVersionId) {
    if (outboundHasMediaHeader(staged)) {
      return staged;
    }
    throw new ValidationError(
      'Cannot send IMAGE template without templateVersionId to rebuild the header (Meta #132012)',
      { messageId },
    );
  }

  let version: Awaited<ReturnType<typeof findTemplateVersionComponentsForOrg>>;
  try {
    version = await findTemplateVersionComponentsForOrg(organizationId, templateVersionId);
  } catch (error) {
    if (error instanceof InternalServerError && error.errorCode === 'DATABASE_NOT_CONFIGURED') {
      // Never send body-only IMAGE templates because prisma was briefly unavailable —
      // surface as retryable so the queue retries instead of shipping a broken message.
      throw new MetaApiError(
        'Database unavailable while repairing template components',
        'DATABASE_NOT_CONFIGURED',
        503,
      );
    }
    throw error;
  }
  if (!version?.components) {
    if (outboundHasMediaHeader(staged)) {
      return staged;
    }
    throw new ValidationError(
      'Template version components missing; cannot rebuild IMAGE header (Meta #132012)',
      { messageId, templateVersionId },
    );
  }

  const templateComponents = version.components;
  const body = staged.filter((component) => component.type === 'body');

  let header: MetaSendTemplateComponent | null = null;
  let headerError: string | undefined;
  try {
    header = buildHeaderComponentFromTemplate(templateComponents);
  } catch (error) {
    headerError = error instanceof Error ? error.message : String(error);
    logger.warn('Could not rebuild template header for send', {
      messageId,
      templateVersionId,
      message: headerError,
    });
  }

  const isValidButtonSuffix = (value: string): boolean =>
    /^[a-f0-9]{24}$/i.test(value) ||
    (/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/.test(value) && !/\s/.test(value));

  let buttons = staged.filter((component) => {
    if (component.type !== 'button') return false;
    const text = component.parameters?.[0];
    if (!text || text.type !== 'text') return false;
    return isValidButtonSuffix(String(text.text || '').trim());
  });

  if (buttons.length === 0) {
    // Recover taskId from the original event ingest when staged button used a title example.
    const messageCorrelationId = await findMessageCorrelationIdForOrg(organizationId, messageId);
    let payload: Record<string, unknown> = {};
    if (messageCorrelationId) {
      payload =
        (await findLatestEventPayloadByCorrelationIdForOrg(organizationId, messageCorrelationId)) ??
        {};
    }

    try {
      buttons = buildUrlButtonComponentsFromTemplate(templateComponents, payload);
    } catch (error) {
      logger.warn('Could not rebuild URL button for send — missing valid taskId', {
        messageId,
        templateVersionId,
        message: error instanceof Error ? error.message : String(error),
        taskId: payload.taskId,
      });
      buttons = [];
    }
  }

  const repaired: MetaSendTemplateComponent[] = [
    ...(header ? [header] : []),
    ...body,
    ...buttons,
  ];

  if (templateRequiresMediaHeader(templateComponents) && !outboundHasMediaHeader(repaired)) {
    throw new ValidationError(
      headerError ||
        'Template requires IMAGE header but outbound components are missing it (Meta #132012)',
      { messageId, templateVersionId },
    );
  }

  const before = JSON.stringify(staged);
  const after = JSON.stringify(repaired);
  if (before !== after) {
    await updateMessageComponents(messageId, repaired);
    logger.info('Repaired outbound template components before Meta send', {
      messageId,
      beforeTypes: staged.map((c) => c.type),
      afterTypes: repaired.map((c) => c.type),
    });
  }

  return repaired;
}

export async function stageOutboundTemplateMessage(
  input: OutboundTemplateMessageInput,
): Promise<CreatedOutboundMessageDto> {
  const recipientPhone = normalizeRecipientPhone(input.recipientPhone);
  return createOutboundTemplateMessage({
    ...input,
    recipientPhone,
  });
}

export async function stageOutboundTextMessage(input: {
  organizationId: string;
  phoneNumberId: string;
  recipientPhone: string;
  correlationId: string;
  bodyText: string;
}): Promise<CreatedOutboundMessageDto> {
  const recipientPhone = normalizeRecipientPhone(input.recipientPhone);
  return createOutboundTextMessage({
    ...input,
    recipientPhone,
  });
}

export async function enqueueStagedMessageSend(
  messageId: string,
  correlationId?: string,
): Promise<void> {
  await enqueueMessageSend({ messageId, correlationId });
}

export async function sendOutboundMessage(messageId: string): Promise<void> {
  const context = await requireMessageSendContext(messageId);

  try {
    assertMessagePhoneSameOrganization({
      messageId: context.messageId,
      messageOrganizationId: context.organizationId,
      phoneNumberId: context.phoneNumberId,
      phoneOrganizationId: context.phoneOrganizationId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'CROSS_ORGANIZATION_PHONE_NUMBER_REFERENCE';
    const errorCode =
      error instanceof ExternalServiceError
        ? error.errorCode
        : 'CROSS_ORGANIZATION_PHONE_NUMBER_REFERENCE';
    logger.error('Blocked outbound send — phone number belongs to another organization', {
      messageId: context.messageId,
      organizationId: context.organizationId,
      phoneNumberId: context.phoneNumberId,
      phoneOrganizationId: context.phoneOrganizationId,
    });
    const failed = await markMessageFailed({
      messageId,
      errorCode,
      errorMessage: message,
    });
    void scheduleOutboundWebhook({
      organizationId: failed.organizationId,
      messageId,
      event: 'message.failed',
    });
    throw error;
  }

  if (context.qualityRating === 'RED') {
    const failed = await markMessageFailed({
      messageId,
      errorCode: 'PHONE_QUALITY_RED',
      errorMessage: 'Sending blocked because phone quality rating is RED',
    });
    void scheduleOutboundWebhook({
      organizationId: failed.organizationId,
      messageId,
      event: 'message.failed',
    });
    throw new ExternalServiceError(
      'Sending blocked because phone quality rating is RED',
      'PHONE_QUALITY_RED',
    );
  }

  const secrets = await findWhatsAppAccountSecrets(
    context.organizationId,
    context.whatsAppAccountId,
  );
  if (!secrets) {
    const failed = await markMessageFailed({
      messageId,
      errorCode: 'WHATSAPP_ACCOUNT_NOT_FOUND',
      errorMessage: 'WhatsApp account not found for send',
    });
    void scheduleOutboundWebhook({
      organizationId: failed.organizationId,
      messageId,
      event: 'message.failed',
    });
    throw new ExternalServiceError('WhatsApp account not found', 'WHATSAPP_ACCOUNT_NOT_FOUND');
  }

  const accessToken = decryptField(secrets.accessTokenEnc);
  const metaClient = getMetaWhatsAppClient();

  await acquireWhatsAppSendSlot(context.metaPhoneNumberId);

  let metaComponents: MetaSendTemplateComponent[] = context.metaComponents;
  if (context.type === 'TEMPLATE') {
    try {
      metaComponents = await repairOutboundTemplateComponents(
        context.organizationId,
        messageId,
        context.metaComponents,
        context.templateVersionId,
      );

      // Final guard: never call Meta with a media-header template missing IMAGE/VIDEO/DOCUMENT.
      if (context.templateVersionId) {
        const version = await findTemplateVersionComponentsForOrg(
          context.organizationId,
          context.templateVersionId,
        );
        if (
          version?.components &&
          templateRequiresMediaHeader(version.components) &&
          !outboundHasMediaHeader(metaComponents)
        ) {
          throw new ValidationError(
            'Template requires IMAGE/VIDEO/DOCUMENT header but outbound components are missing it (Meta #132012)',
            {
              messageId,
              templateVersionId: context.templateVersionId,
              stagedTypes: metaComponents.map((component) => component.type),
            },
          );
        }
      }
    } catch (error) {
      if (isRetryableSendError(error)) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Template component repair failed';
      const errorCode =
        error instanceof ExternalServiceError ? error.errorCode : 'TEMPLATE_COMPONENT_REPAIR_FAILED';
      const failed = await markMessageFailed({
        messageId,
        errorCode,
        errorMessage: message,
      });
      void scheduleOutboundWebhook({
        organizationId: failed.organizationId,
        messageId,
        event: 'message.failed',
      });
      throw error;
    }
  }

  try {
    const response =
      context.type === 'TEXT'
        ? await metaClient.sendTextMessage(context.metaPhoneNumberId, accessToken, {
            messaging_product: 'whatsapp',
            to: context.recipientPhone,
            type: 'text',
            text: { body: context.bodyText ?? '' },
          })
        : await metaClient.sendTemplateMessage(context.metaPhoneNumberId, accessToken, {
            messaging_product: 'whatsapp',
            to: context.recipientPhone,
            type: 'template',
            template: {
              name: context.metaTemplateName ?? '',
              language: { code: context.language },
              ...(metaComponents.length > 0 ? { components: metaComponents } : {}),
            },
          });

    const metaMessageId = response.messages?.[0]?.id;
    if (!metaMessageId) {
      throw new ExternalServiceError(
        'Meta did not return a message id',
        'META_MESSAGE_ID_MISSING',
      );
    }

    const sent = await markMessageSent({ messageId, metaMessageId });
    void scheduleOutboundWebhook({
      organizationId: sent.organizationId,
      messageId,
      event: 'message.sent',
    });
  } catch (error) {
    if (isRetryableSendError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Meta send failed';
    const errorCode =
      error instanceof ExternalServiceError ? error.errorCode : 'META_SEND_FAILED';

    const failed = await markMessageFailed({
      messageId,
      errorCode,
      errorMessage: message,
    });
    void scheduleOutboundWebhook({
      organizationId: failed.organizationId,
      messageId,
      event: 'message.failed',
    });
    throw error;
  }
}
