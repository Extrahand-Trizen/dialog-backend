import { decryptField } from '../../infrastructure/encryption/fieldCrypto';
import { getMetaWhatsAppClient } from '../../infrastructure/meta';
import { enqueueMessageSend } from '../../infrastructure/queues/queues';
import { acquireWhatsAppSendSlot } from '../../infrastructure/redis/sendRateLimit';
import { ExternalServiceError, ValidationError } from '../../shared/errors/AppError';
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
  markMessageFailed,
  markMessageSent,
  requireMessageSendContext,
  updateMessageComponents,
} from './messages.repository';
import type { CreatedOutboundMessageDto, OutboundTemplateMessageInput } from './messages.schemas';
import type { MetaSendTemplateComponent } from '../../infrastructure/meta';
import { getPrismaClient } from '../../infrastructure/prisma/client';
import logger from '../../infrastructure/logging/logger';

/**
 * Repair staged components that were saved without IMAGE header / URL button
 * (e.g. mid-deploy race). Meta error #132012 / #131008 otherwise.
 */
export async function repairOutboundTemplateComponents(
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

  const prisma = getPrismaClient();
  if (!prisma) {
    // Never send body-only IMAGE templates because prisma was briefly unavailable.
    throw new MetaApiError(
      'Database unavailable while repairing template components',
      'DATABASE_NOT_CONFIGURED',
      503,
    );
  }

  const version = await prisma.templateVersion.findUnique({
    where: { id: templateVersionId },
    select: { components: true },
  });
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
    const messageRow = await prisma.message.findUnique({
      where: { id: messageId },
      select: { correlationId: true },
    });
    let payload: Record<string, unknown> = {};
    if (messageRow?.correlationId) {
      const event = await prisma.eventIngest.findFirst({
        where: { correlationId: messageRow.correlationId },
        select: { payload: true },
        orderBy: { createdAt: 'desc' },
      });
      if (event?.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)) {
        payload = event.payload as Record<string, unknown>;
      }
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

export async function enqueueStagedMessageSend(
  messageId: string,
  correlationId?: string,
): Promise<void> {
  await enqueueMessageSend({ messageId, correlationId });
}

export async function sendOutboundMessage(messageId: string): Promise<void> {
  const context = await requireMessageSendContext(messageId);

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

  let metaComponents: MetaSendTemplateComponent[];
  try {
    metaComponents = await repairOutboundTemplateComponents(
      messageId,
      context.metaComponents,
      context.templateVersionId,
    );
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

  try {
    const response = await metaClient.sendTemplateMessage(
      context.metaPhoneNumberId,
      accessToken,
      {
        messaging_product: 'whatsapp',
        to: context.recipientPhone,
        type: 'template',
        template: {
          name: context.metaTemplateName,
          language: { code: context.language },
          ...(metaComponents.length > 0 ? { components: metaComponents } : {}),
        },
      },
    );

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
