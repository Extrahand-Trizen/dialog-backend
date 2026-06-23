import { Worker } from 'bullmq';
import type { TemplateSyncJobData } from '../../modules/templates/templates.schemas';
import { getQueueConnection, isQueueInfrastructureConfigured } from '../../infrastructure/queues/connection';
import { QUEUE_NAMES } from '../../infrastructure/queues/registry';
import logger from '../../infrastructure/logging/logger';
import { processTemplateSyncJob } from '../processors/templateSync.processor';

let templateSyncWorker: Worker<TemplateSyncJobData> | null = null;

export function startTemplateSyncWorker(): void {
  if (!isQueueInfrastructureConfigured() || templateSyncWorker) {
    return;
  }

  templateSyncWorker = new Worker<TemplateSyncJobData>(
    QUEUE_NAMES.TEMPLATE_SYNC,
    async (job) => processTemplateSyncJob(job),
    {
      connection: getQueueConnection(),
      concurrency: 2,
    },
  );

  templateSyncWorker.on('failed', (job, error) => {
    logger.error('Template sync job failed', {
      jobId: job?.id,
      whatsAppAccountId: job?.data.whatsAppAccountId,
      message: error.message,
    });
  });

  logger.info('Template sync worker started');
}

export async function stopTemplateSyncWorker(): Promise<void> {
  if (!templateSyncWorker) {
    return;
  }

  await templateSyncWorker.close();
  templateSyncWorker = null;
  logger.info('Template sync worker stopped');
}
