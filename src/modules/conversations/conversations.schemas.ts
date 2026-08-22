import { z } from 'zod';
import type { MessageDirection } from '@prisma/client';

export const listConversationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.coerce.boolean().optional(),
  search: z.string().trim().max(40).optional(),
});
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

export const listConversationThreadQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ListConversationThreadQuery = z.infer<typeof listConversationThreadQuerySchema>;

export const sendConversationReplySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    body: z.string().trim().min(1).max(4096),
    idempotencyKey: z.string().min(1).max(200),
  }),
  z.object({
    type: z.literal('template'),
    template: z.string().min(1).max(512),
    language: z.string().min(2).max(10).default('en'),
    variables: z.union([z.record(z.string(), z.string()), z.array(z.string())]).optional(),
    idempotencyKey: z.string().min(1).max(200),
  }),
]);
export type SendConversationReplyInput = z.infer<typeof sendConversationReplySchema>;

export type ConversationSummaryDto = {
  id: string;
  phoneNumberId: string;
  contactPhone: string;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastMessageDirection: MessageDirection | null;
  unreadCount: number;
  canSendFreeText: boolean;
  lastInboundAt: string | null;
  freeTextWindowExpiresAt: string | null;
};

export type ConversationThreadMessageDto = {
  id: string;
  direction: MessageDirection;
  type: string;
  status: string;
  bodyText: string | null;
  metaTemplateName: string | null;
  components: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
};

export type SendConversationReplyResultDto = {
  messageId: string;
  duplicate: boolean;
  status: string;
};
