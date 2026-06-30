import { Worker } from 'bullmq';
import type { MessageSendJobData } from '../../modules/messages/messages.schemas';
import { getQueueConnection, isQueueInfrastructureConfigured } from '../../infrastructure/queues/connection';
import { QUEUE_NAMES } from '../../infrastructure/queues/registry';
import logger from '../../infrastructure/logging/logger';
import { processMessageSendJob } from '../processors/messageSend.processor';

let messageSendWorker: Worker<MessageSendJobData> | null = null;

export function startMessageSendWorker(): void {
  if (!isQueueInfrastructureConfigured() || messageSendWorker) {
    return;
  }

  messageSendWorker = new Worker<MessageSendJobData>(
    QUEUE_NAMES.MESSAGE_SEND,
    async (job) => processMessageSendJob(job),
    {
      connection: getQueueConnection(),
      concurrency: 3,
    },
  );

  messageSendWorker.on('failed', (job, error) => {
    logger.error('Message send job failed', {
      jobId: job?.id,
      messageId: job?.data.messageId,
      message: error.message,
    });
  });

  logger.info('Message send worker started');
}

export async function stopMessageSendWorker(): Promise<void> {
  if (!messageSendWorker) {
    return;
  }

  await messageSendWorker.close();
  messageSendWorker = null;
  logger.info('Message send worker stopped');
}
