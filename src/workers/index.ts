import { startWebhookIngestWorker, stopWebhookIngestWorker } from './queues/webhookIngest.worker';
import { startTemplateSyncWorker, stopTemplateSyncWorker } from './queues/templateSync.worker';
import {
  startNotificationTriggerWorker,
  stopNotificationTriggerWorker,
} from './queues/notificationTrigger.worker';
import { startMessageSendWorker, stopMessageSendWorker } from './queues/messageSend.worker';
import {
  startOutboundWebhookWorker,
  stopOutboundWebhookWorker,
} from './queues/outboundWebhook.worker';
import { closeQueues } from '../infrastructure/queues/queues';
import { isQueueInfrastructureConfigured } from '../infrastructure/queues/connection';
import logger from '../infrastructure/logging/logger';

export function startWorkers(): void {
  if (!isQueueInfrastructureConfigured()) {
    logger.warn('Workers not started — Redis is not configured');
    return;
  }

  startWebhookIngestWorker();
  startTemplateSyncWorker();
  startNotificationTriggerWorker();
  startMessageSendWorker();
  startOutboundWebhookWorker();
}

export async function stopWorkers(): Promise<void> {
  await stopWebhookIngestWorker();
  await stopTemplateSyncWorker();
  await stopNotificationTriggerWorker();
  await stopMessageSendWorker();
  await stopOutboundWebhookWorker();
  await closeQueues();
}
