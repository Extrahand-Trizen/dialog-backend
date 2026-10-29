import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import type { MessageSendJobData } from '../../modules/messages/messages.schemas';
import { executeOutboundMessage } from '../../modules/messages/message.orchestrator';
import { AppError } from '../../shared/errors/AppError';
import { isRetryableSendError } from '../../shared/errors/sendErrors';
import logger from '../../infrastructure/logging/logger';

export async function processMessageSendJob(job: Job<MessageSendJobData>): Promise<void> {
  try {
    logger.info('Processing message send job', {
      jobId: job.id,
      messageId: job.data.messageId,
      correlationId: job.data.correlationId,
    });
    await executeOutboundMessage(job.data.messageId);
  } catch (error) {
    logger.error('Message send processor failed', {
      jobId: job.id,
      messageId: job.data.messageId,
      retryable: isRetryableSendError(error),
      message: error instanceof Error ? error.message : 'Message send processor failed',
    });
    if (isRetryableSendError(error)) {
      throw error;
    }

    if (error instanceof AppError) {
      throw new UnrecoverableError(error.message);
    }

    throw error;
  }
}
