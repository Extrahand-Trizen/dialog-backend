export type WebhookEventType =
  | 'MESSAGES'
  | 'MESSAGE_TEMPLATE_STATUS_UPDATE'
  | 'PHONE_NUMBER_QUALITY_UPDATE'
  | 'UNKNOWN';

export type WebhookEventStatus =
  | 'RECEIVED'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'FAILED';

export type WebhookIngestJobData = {
  webhookEventId: string;
  correlationId?: string;
};

export type WebhookEventDto = {
  id: string;
  organizationId: string | null;
  metaWabaId: string | null;
  metaEventId: string | null;
  correlationId: string | null;
  eventType: WebhookEventType;
  status: WebhookEventStatus;
  attemptCount: number;
  errorMessage: string | null;
  receivedAt: string;
  processedAt: string | null;
};
