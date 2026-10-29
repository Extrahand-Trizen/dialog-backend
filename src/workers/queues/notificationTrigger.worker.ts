import { Worker } from 'bullmq';
import type { NotificationTriggerJobData } from '../../modules/notifications/notifications.schemas';
import { getQueueWorkerOptions, isQueueInfrastructureConfigured } from '../../infrastructure/queues/connection';
import { QUEUE_NAMES } from '../../infrastructure/queues/registry';
import logger from '../../infrastructure/logging/logger';
import { processNotificationTriggerJob } from '../processors/notificationTrigger.processor';

let notificationTriggerWorker: Worker<NotificationTriggerJobData> | null = null;

export function startNotificationTriggerWorker(): void {
  if (!isQueueInfrastructureConfigured() || notificationTriggerWorker) {
    return;
  }

  notificationTriggerWorker = new Worker<NotificationTriggerJobData>(
    QUEUE_NAMES.NOTIFICATION_TRIGGER,
    async (job) => processNotificationTriggerJob(job),
    {
      ...getQueueWorkerOptions(),
      concurrency: 5,
    },
  );

  notificationTriggerWorker.on('failed', (job, error) => {
    logger.error('Notification trigger job failed', {
      jobId: job?.id,
      eventIngestId: job?.data.eventIngestId,
      message: error.message,
    });
  });
  notificationTriggerWorker.on('active', (job) => {
    logger.info('Notification trigger job started', {
      jobId: job.id,
      eventIngestId: job.data.eventIngestId,
    });
  });
  notificationTriggerWorker.on('completed', (job) => {
    logger.info('Notification trigger job completed', {
      jobId: job.id,
      eventIngestId: job.data.eventIngestId,
    });
  });
  notificationTriggerWorker.on('error', (error) => {
    logger.error('Notification trigger worker error', { message: error.message });
  });

  logger.info('Notification trigger worker started');
}

export async function stopNotificationTriggerWorker(): Promise<void> {
  if (!notificationTriggerWorker) {
    return;
  }

  await notificationTriggerWorker.close();
  notificationTriggerWorker = null;
  logger.info('Notification trigger worker stopped');
}
