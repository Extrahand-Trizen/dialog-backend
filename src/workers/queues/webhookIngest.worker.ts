import { Worker } from 'bullmq';
import type { WebhookIngestJobData } from '../../modules/webhooks/webhooks.schemas';
import { getQueueConnection, isQueueInfrastructureConfigured } from '../../infrastructure/queues/connection';
import { QUEUE_NAMES } from '../../infrastructure/queues/registry';
import logger from '../../infrastructure/logging/logger';
import { processWebhookIngestJob } from '../processors/webhookIngest.processor';

let webhookIngestWorker: Worker<WebhookIngestJobData> | null = null;

export function startWebhookIngestWorker(): void {
  if (!isQueueInfrastructureConfigured() || webhookIngestWorker) {
    return;
  }

  webhookIngestWorker = new Worker<WebhookIngestJobData>(
    QUEUE_NAMES.WEBHOOK_INGEST,
    async (job) => processWebhookIngestJob(job),
    {
      connection: getQueueConnection(),
      concurrency: 5,
    },
  );

  webhookIngestWorker.on('failed', (job, error) => {
    logger.error('Webhook ingest job failed', {
      jobId: job?.id,
      webhookEventId: job?.data.webhookEventId,
      message: error.message,
    });
  });

  logger.info('Webhook ingest worker started');
}

export async function stopWebhookIngestWorker(): Promise<void> {
  if (!webhookIngestWorker) {
    return;
  }

  await webhookIngestWorker.close();
  webhookIngestWorker = null;
  logger.info('Webhook ingest worker stopped');
}
