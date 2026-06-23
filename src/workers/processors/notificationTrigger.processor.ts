import type { Job } from 'bullmq';
import type { NotificationTriggerJobData } from '../../modules/notifications/notifications.schemas';
import { processEventIngest } from '../../modules/notifications/notification.orchestrator';

export async function processNotificationTriggerJob(
  job: Job<NotificationTriggerJobData>,
): Promise<void> {
  await processEventIngest(job.data.eventIngestId, {
    executionSource: job.data.executionSource ?? 'EVENT',
  });
}
