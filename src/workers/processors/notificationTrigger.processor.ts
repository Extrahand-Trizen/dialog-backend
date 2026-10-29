import type { Job } from 'bullmq';
import type { NotificationTriggerJobData } from '../../modules/notifications/notifications.schemas';
import { processEventIngest } from '../../modules/notifications/notification.orchestrator';
import logger from '../../infrastructure/logging/logger';

export async function processNotificationTriggerJob(
  job: Job<NotificationTriggerJobData>,
): Promise<void> {
  logger.info('Processing notification trigger job', {
    jobId: job.id,
    eventIngestId: job.data.eventIngestId,
    executionSource: job.data.executionSource ?? 'EVENT',
  });
  await processEventIngest(job.data.eventIngestId, {
    executionSource: job.data.executionSource ?? 'EVENT',
  });
}
