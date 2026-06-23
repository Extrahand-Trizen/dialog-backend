import { Queue } from 'bullmq';
import { InternalServerError } from '../../shared/errors/AppError';
import type { MessageSendJobData } from '../../modules/messages/messages.schemas';
import type { NotificationTriggerJobData } from '../../modules/notifications/notifications.schemas';
import type { OutboundWebhookJobData } from '../../modules/outboundWebhooks/outboundWebhooks.schemas';
import type { TemplateSyncJobData } from '../../modules/templates/templates.schemas';
import { getQueueConnection, isQueueInfrastructureConfigured } from './connection';
import { buildJobId } from './jobId';
import { DEFAULT_JOB_OPTIONS, MESSAGE_SEND_JOB_OPTIONS, QUEUE_NAMES } from './registry';

export type WebhookIngestJobData = {
  webhookEventId: string;
  correlationId?: string;
};

let webhookIngestQueue: Queue<WebhookIngestJobData> | null = null;
let templateSyncQueue: Queue<TemplateSyncJobData> | null = null;
let notificationTriggerQueue: Queue<NotificationTriggerJobData> | null = null;
let messageSendQueue: Queue<MessageSendJobData> | null = null;
let outboundWebhookQueue: Queue<OutboundWebhookJobData> | null = null;

export function getWebhookIngestQueue(): Queue<WebhookIngestJobData> | null {
  if (!isQueueInfrastructureConfigured()) {
    return null;
  }

  if (!webhookIngestQueue) {
    webhookIngestQueue = new Queue<WebhookIngestJobData>(QUEUE_NAMES.WEBHOOK_INGEST, {
      connection: getQueueConnection(),
    });
  }

  return webhookIngestQueue;
}

export async function enqueueWebhookIngest(data: WebhookIngestJobData): Promise<void> {
  const queue = getWebhookIngestQueue();
  if (!queue) {
    throw new InternalServerError('Webhook queue is not configured', 'QUEUE_NOT_CONFIGURED');
  }

  await queue.add('webhook-ingest', data, {
    ...DEFAULT_JOB_OPTIONS,
    jobId: data.webhookEventId,
  });
}

export function getTemplateSyncQueue(): Queue<TemplateSyncJobData> | null {
  if (!isQueueInfrastructureConfigured()) {
    return null;
  }

  if (!templateSyncQueue) {
    templateSyncQueue = new Queue<TemplateSyncJobData>(QUEUE_NAMES.TEMPLATE_SYNC, {
      connection: getQueueConnection(),
    });
  }

  return templateSyncQueue;
}

export async function enqueueTemplateSync(data: TemplateSyncJobData): Promise<void> {
  const queue = getTemplateSyncQueue();
  if (!queue) {
    throw new InternalServerError('Template sync queue is not configured', 'QUEUE_NOT_CONFIGURED');
  }

  await queue.add('template-sync', data, {
    ...DEFAULT_JOB_OPTIONS,
    jobId: buildJobId('template-sync', data.whatsAppAccountId),
  });
}

export function getNotificationTriggerQueue(): Queue<NotificationTriggerJobData> | null {
  if (!isQueueInfrastructureConfigured()) {
    return null;
  }

  if (!notificationTriggerQueue) {
    notificationTriggerQueue = new Queue<NotificationTriggerJobData>(
      QUEUE_NAMES.NOTIFICATION_TRIGGER,
      {
        connection: getQueueConnection(),
      },
    );
  }

  return notificationTriggerQueue;
}

export async function enqueueNotificationTrigger(
  data: NotificationTriggerJobData,
): Promise<void> {
  const queue = getNotificationTriggerQueue();
  if (!queue) {
    throw new InternalServerError(
      'Notification trigger queue is not configured',
      'QUEUE_NOT_CONFIGURED',
    );
  }

  await queue.add('notification-trigger', data, {
    ...DEFAULT_JOB_OPTIONS,
    jobId: data.eventIngestId,
  });
}

export function getMessageSendQueue(): Queue<MessageSendJobData> | null {
  if (!isQueueInfrastructureConfigured()) {
    return null;
  }

  if (!messageSendQueue) {
    messageSendQueue = new Queue<MessageSendJobData>(QUEUE_NAMES.MESSAGE_SEND, {
      connection: getQueueConnection(),
    });
  }

  return messageSendQueue;
}

export async function enqueueMessageSend(data: MessageSendJobData): Promise<void> {
  const queue = getMessageSendQueue();
  if (!queue) {
    throw new InternalServerError('Message send queue is not configured', 'QUEUE_NOT_CONFIGURED');
  }

  await queue.add('message-send', data, {
    ...MESSAGE_SEND_JOB_OPTIONS,
    jobId: data.messageId,
  });
}

export function getOutboundWebhookQueue(): Queue<OutboundWebhookJobData> | null {
  if (!isQueueInfrastructureConfigured()) {
    return null;
  }

  if (!outboundWebhookQueue) {
    outboundWebhookQueue = new Queue<OutboundWebhookJobData>(QUEUE_NAMES.OUTBOUND_WEBHOOK, {
      connection: getQueueConnection(),
    });
  }

  return outboundWebhookQueue;
}

export async function enqueueOutboundWebhook(data: OutboundWebhookJobData): Promise<void> {
  const queue = getOutboundWebhookQueue();
  if (!queue) {
    throw new InternalServerError('Outbound webhook queue is not configured', 'QUEUE_NOT_CONFIGURED');
  }

  await queue.add('outbound-webhook', data, {
    ...DEFAULT_JOB_OPTIONS,
    jobId: buildJobId(data.messageId, data.event),
  });
}

export async function closeQueues(): Promise<void> {
  if (webhookIngestQueue) {
    await webhookIngestQueue.close();
    webhookIngestQueue = null;
  }

  if (templateSyncQueue) {
    await templateSyncQueue.close();
    templateSyncQueue = null;
  }

  if (notificationTriggerQueue) {
    await notificationTriggerQueue.close();
    notificationTriggerQueue = null;
  }

  if (messageSendQueue) {
    await messageSendQueue.close();
    messageSendQueue = null;
  }

  if (outboundWebhookQueue) {
    await outboundWebhookQueue.close();
    outboundWebhookQueue = null;
  }
}
