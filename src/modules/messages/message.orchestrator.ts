import {
  markExecutionFailedForMessage,
  markExecutionSentForMessage,
} from '../notifications/notifications.service';
import { isRetryableSendError } from '../../shared/errors/sendErrors';
import { sendOutboundMessage } from './messages.service';

export async function executeOutboundMessage(messageId: string): Promise<void> {
  try {
    await sendOutboundMessage(messageId);
    await markExecutionSentForMessage(messageId);
  } catch (error) {
    if (isRetryableSendError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Outbound send failed';
    await markExecutionFailedForMessage(messageId, message);
    throw error;
  }
}
