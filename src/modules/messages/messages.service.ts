import { decryptField } from '../../infrastructure/encryption/fieldCrypto';
import { getMetaWhatsAppClient } from '../../infrastructure/meta';
import { enqueueMessageSend } from '../../infrastructure/queues/queues';
import { acquireWhatsAppSendSlot } from '../../infrastructure/redis/sendRateLimit';
import { ExternalServiceError } from '../../shared/errors/AppError';
import { isRetryableSendError } from '../../shared/errors/sendErrors';
import { scheduleOutboundWebhook } from '../outboundWebhooks';
import { findWhatsAppAccountSecrets } from '../whatsapp/whatsapp.repository';
import { normalizeRecipientPhone } from './messages.meta';
import {
  createOutboundTemplateMessage,
  markMessageFailed,
  markMessageSent,
  requireMessageSendContext,
} from './messages.repository';
import type { CreatedOutboundMessageDto, OutboundTemplateMessageInput } from './messages.schemas';

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
          ...(context.metaComponents.length > 0
            ? { components: context.metaComponents }
            : {}),
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
