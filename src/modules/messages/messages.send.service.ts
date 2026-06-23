import { ValidationError } from '../../shared/errors/AppError';
import { scheduleOutboundWebhook } from '../outboundWebhooks';
import { findApprovedTemplateForSend } from '../templates/templates.repository';
import { resolvePhoneForNotification } from '../whatsapp/whatsapp.service';
import { buildTemplateComponentsFromVariables } from './messages.meta';
import { findOutboundMessageByIdempotencyKey } from './messages.repository';
import {
  enqueueStagedMessageSend,
  stageOutboundTemplateMessage,
} from './messages.service';
import type { SendTemplateMessageInput, SendTemplateMessageResultDto } from './messages.schemas';

export async function sendOrganizationTemplateMessage(input: {
  organizationId: string;
  correlationId: string;
  body: SendTemplateMessageInput;
}): Promise<SendTemplateMessageResultDto> {
  const existing = await findOutboundMessageByIdempotencyKey({
    organizationId: input.organizationId,
    idempotencyKey: input.body.idempotencyKey,
  });

  if (existing) {
    return {
      messageId: existing.id,
      duplicate: true,
      status: existing.status,
      idempotencyKey: input.body.idempotencyKey,
      template: input.body.template,
    };
  }

  const template = await findApprovedTemplateForSend({
    organizationId: input.organizationId,
    metaTemplateName: input.body.template,
    language: input.body.language,
  });

  if (!template) {
    throw new ValidationError('Template not found or not approved for send', {
      template: input.body.template,
      language: input.body.language,
    });
  }

  const phone = await resolvePhoneForNotification(
    input.organizationId,
    input.body.phoneNumberId,
  );

  if (!phone) {
    throw new ValidationError('No WhatsApp phone number configured for send', {
      phoneNumberId: input.body.phoneNumberId ?? null,
    });
  }

  const metaComponents = buildTemplateComponentsFromVariables(
    template.variableSchema,
    input.body.variables,
  );

  const staged = await stageOutboundTemplateMessage({
    organizationId: input.organizationId,
    phoneNumberId: phone.id,
    recipientPhone: input.body.to,
    correlationId: input.body.idempotencyKey,
    templateVersionId: template.templateVersionId,
    metaTemplateName: template.metaTemplateName,
    metaComponents,
  });

  await enqueueStagedMessageSend(staged.messageId, input.correlationId);

  void scheduleOutboundWebhook({
    organizationId: input.organizationId,
    messageId: staged.messageId,
    event: 'message.accepted',
  });

  return {
    messageId: staged.messageId,
    duplicate: false,
    status: 'QUEUED',
    idempotencyKey: input.body.idempotencyKey,
    template: input.body.template,
  };
}
