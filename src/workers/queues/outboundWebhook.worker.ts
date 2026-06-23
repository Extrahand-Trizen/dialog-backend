import { Worker } from 'bullmq';
import type { OutboundWebhookJobData } from '../../modules/outboundWebhooks/outboundWebhooks.schemas';
import { getQueueConnection, isQueueInfrastructureConfigured } from '../../infrastructure/queues/connection';
import { QUEUE_NAMES } from '../../infrastructure/queues/registry';
import logger from '../../infrastructure/logging/logger';
import { processOutboundWebhookJob } from '../processors/outboundWebhook.processor';

let outboundWebhookWorker: Worker<OutboundWebhookJobData> | null = null;

export function startOutboundWebhookWorker(): void {
  if (!isQueueInfrastructureConfigured() || outboundWebhookWorker) {
    return;
  }

  outboundWebhookWorker = new Worker<OutboundWebhookJobData>(
    QUEUE_NAMES.OUTBOUND_WEBHOOK,
    async (job) => processOutboundWebhookJob(job),
    {
      connection: getQueueConnection(),
      concurrency: 5,
    },
  );

  outboundWebhookWorker.on('failed', (job, error) => {
    logger.error('Outbound webhook job failed', {
      jobId: job?.id,
      messageId: job?.data.messageId,
      event: job?.data.event,
      message: error.message,
    });
  });

  logger.info('Outbound webhook worker started');
}

export async function stopOutboundWebhookWorker(): Promise<void> {
  if (!outboundWebhookWorker) {
    return;
  }

  await outboundWebhookWorker.close();
  outboundWebhookWorker = null;
  logger.info('Outbound webhook worker stopped');
}
