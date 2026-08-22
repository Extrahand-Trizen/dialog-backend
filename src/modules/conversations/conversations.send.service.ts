import { ValidationError } from '../../shared/errors/AppError';
import { scheduleOutboundWebhook } from '../outboundWebhooks';
import { findOutboundMessageByIdempotencyKey } from '../messages/messages.repository';
import { enqueueStagedMessageSend, stageOutboundTextMessage } from '../messages/messages.service';
import { sendOrganizationTemplateMessage } from '../messages/messages.send.service';
import type { SendConversationReplyInput, SendConversationReplyResultDto } from './conversations.schemas';
import { buildMessagePreview, requireConversationForOrg, upsertConversationForOutbound } from './conversations.repository';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function sendConversationReply(input: {
  organizationId: string;
  correlationId: string;
  conversationId: string;
  body: SendConversationReplyInput;
}): Promise<SendConversationReplyResultDto> {
  const conversation = await requireConversationForOrg(input.organizationId, input.conversationId);

  if (input.body.type === 'template') {
    const result = await sendOrganizationTemplateMessage({
      organizationId: input.organizationId,
      correlationId: input.correlationId,
      body: {
        template: input.body.template,
        language: input.body.language,
        to: conversation.contactPhone,
        variables: input.body.variables,
        idempotencyKey: input.body.idempotencyKey,
        phoneNumberId: conversation.phoneNumberId,
      },
    });

    return {
      messageId: result.messageId,
      duplicate: result.duplicate,
      status: result.status,
    };
  }

  // type === 'text' — free-text replies are only allowed within Meta's 24h customer
  // service window after the customer's last inbound message. This is the authoritative
  // server-side gate; the `canSendFreeText` flag on GET /conversations is a UI hint only.
  const windowOpen =
    conversation.lastInboundAt !== null &&
    Date.now() - conversation.lastInboundAt.getTime() < TWENTY_FOUR_HOURS_MS;

  if (!windowOpen) {
    throw new ValidationError(
      "Free-text replies are only allowed within 24 hours of the customer's last message. Send an approved template instead.",
      {
        conversationId: input.conversationId,
        lastInboundAt: conversation.lastInboundAt?.toISOString() ?? null,
        errorReason: 'OUTSIDE_24H_WINDOW',
      },
    );
  }

  const existing = await findOutboundMessageByIdempotencyKey({
    organizationId: input.organizationId,
    idempotencyKey: input.body.idempotencyKey,
  });

  if (existing) {
    return { messageId: existing.id, duplicate: true, status: existing.status };
  }

  const staged = await stageOutboundTextMessage({
    organizationId: input.organizationId,
    phoneNumberId: conversation.phoneNumberId,
    recipientPhone: conversation.contactPhone,
    correlationId: input.body.idempotencyKey,
    bodyText: input.body.body,
  });

  await enqueueStagedMessageSend(staged.messageId, input.correlationId);

  await upsertConversationForOutbound({
    organizationId: input.organizationId,
    phoneNumberId: conversation.phoneNumberId,
    contactPhone: conversation.contactPhone,
    occurredAt: new Date(),
    preview: buildMessagePreview({ type: 'TEXT', bodyText: input.body.body }),
  });

  void scheduleOutboundWebhook({
    organizationId: input.organizationId,
    messageId: staged.messageId,
    event: 'message.accepted',
  });

  return { messageId: staged.messageId, duplicate: false, status: 'QUEUED' };
}