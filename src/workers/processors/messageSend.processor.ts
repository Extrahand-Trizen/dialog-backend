import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import type { MessageSendJobData } from '../../modules/messages/messages.schemas';
import { executeOutboundMessage } from '../../modules/messages/message.orchestrator';
import { AppError } from '../../shared/errors/AppError';
import { isRetryableSendError } from '../../shared/errors/sendErrors';

export async function processMessageSendJob(job: Job<MessageSendJobData>): Promise<void> {
  try {
    await executeOutboundMessage(job.data.messageId);
  } catch (error) {
    if (isRetryableSendError(error)) {
      throw error;
    }

    if (error instanceof AppError) {
      throw new UnrecoverableError(error.message);
    }

    throw error;
  }
}
