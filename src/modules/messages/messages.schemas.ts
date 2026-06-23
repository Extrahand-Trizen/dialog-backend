import { z } from 'zod';
import type { MetaSendTemplateComponent } from '../../infrastructure/meta';

export type MessageSendJobData = {
  messageId: string;
  correlationId?: string;
};

export const MESSAGE_STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED'] as const;
export type MessageListStatus = (typeof MESSAGE_STATUSES)[number];

export const listMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(MESSAGE_STATUSES).optional(),
  recipientPhone: z.string().trim().min(4).max(20).optional(),
  metaTemplateName: z.string().trim().min(1).max(200).optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

export type MessageSummaryDto = {
  id: string;
  organizationId: string;
  phoneNumberId: string;
  correlationId: string | null;
  recipientPhone: string;
  type: string;
  metaTemplateName: string | null;
  metaMessageId: string | null;
  status: MessageListStatus;
  errorCode: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessageDetailDto = MessageSummaryDto & {
  components: unknown;
  bodyText: string | null;
  pricingCategory: string | null;
  pricingModel: string | null;
  billable: boolean | null;
  metaConversationId: string | null;
  templateVersionId: string | null;
  phoneNumber: {
    id: string;
    displayNumber: string;
    verifiedName: string | null;
  };
};

export type OutboundTemplateMessageInput = {
  organizationId: string;
  phoneNumberId: string;
  recipientPhone: string;
  correlationId: string;
  templateVersionId: string;
  metaTemplateName: string;
  metaComponents: MetaSendTemplateComponent[];
};

export type CreatedOutboundMessageDto = {
  messageId: string;
};

export const sendTemplateMessageSchema = z.object({
  template: z.string().min(1).max(512),
  language: z.string().min(2).max(10).default('en'),
  to: z.string().min(8).max(20),
  variables: z
    .union([z.record(z.string(), z.string()), z.array(z.string())])
    .optional(),
  idempotencyKey: z.string().min(1).max(200),
  phoneNumberId: z.string().uuid().optional(),
});

export type SendTemplateMessageInput = z.infer<typeof sendTemplateMessageSchema>;

export type SendTemplateMessageResultDto = {
  messageId: string;
  duplicate: boolean;
  status: MessageListStatus;
  idempotencyKey: string;
  template: string;
};

export type MessageSendContextDto = {
  messageId: string;
  organizationId: string;
  correlationId: string | null;
  recipientPhone: string;
  metaTemplateName: string;
  language: string;
  metaComponents: MetaSendTemplateComponent[];
  metaPhoneNumberId: string;
  whatsAppAccountId: string;
  qualityRating: string;
};
