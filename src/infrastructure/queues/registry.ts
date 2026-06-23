export const QUEUE_NAMES = {
  WEBHOOK_INGEST: 'webhook-ingest',
  NOTIFICATION_TRIGGER: 'notification-trigger',
  MESSAGE_SEND: 'message-send',
  TEMPLATE_SYNC: 'template-sync',
  OUTBOUND_WEBHOOK: 'outbound-webhook',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export const MESSAGE_SEND_JOB_OPTIONS = {
  attempts: 6,
  backoff: {
    type: 'exponential' as const,
    delay: 3000,
  },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};
