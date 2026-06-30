export { ingestEventSchema as internalNotificationTriggerSchema } from '../notifications/notifications.schemas';
export type { IngestEventInput as InternalNotificationTriggerInput } from '../notifications/notifications.schemas';

export type InternalNotificationTriggerResultDto = {
  eventIngestId: string;
  correlationId: string;
  duplicate: boolean;
  executionId?: string;
  messageId?: string;
};
