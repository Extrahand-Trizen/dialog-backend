import { z } from 'zod';

export const OUTBOUND_WEBHOOK_EVENTS = [
  'message.accepted',
  'message.sent',
  'message.delivered',
  'message.read',
  'message.failed',
] as const;

export type OutboundWebhookEventType = (typeof OUTBOUND_WEBHOOK_EVENTS)[number];

export const upsertOutboundWebhookSchema = z.object({
  url: z.string().url().max(2048),
  secret: z.string().min(16).max(256).optional(),
  enabled: z.boolean().default(true),
});

export type UpsertOutboundWebhookInput = z.infer<typeof upsertOutboundWebhookSchema>;

export type OutboundWebhookConfigDto = {
  url: string;
  enabled: boolean;
  hasSecret: boolean;
  events: OutboundWebhookEventType[];
  updatedAt: string | null;
};

export type OutboundWebhookJobData = {
  organizationId: string;
  messageId: string;
  event: OutboundWebhookEventType;
};

export type OutboundWebhookPayload = {
  event: OutboundWebhookEventType;
  timestamp: string;
  data: {
    messageId: string;
    idempotencyKey: string | null;
    template: string | null;
    to: string;
    status: string;
    metaMessageId: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  };
};
