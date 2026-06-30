import { ConflictError, InternalServerError } from '../../shared/errors/AppError';
import { enqueueNotificationTrigger } from '../../infrastructure/queues/queues';
import {
  findEventIngestByIdempotencyKey,
  findLatestExecutionForEventIngest,
  insertEventIngest,
  listEventIngestsByOrganization,
  updateNotificationExecutionByMessageId,
} from './notifications.repository';
import type { EventIngestDto, IngestEventInput, IngestEventResultDto } from './notifications.schemas';

export async function ingestOrganizationEvent(input: {
  organizationId: string;
  apiKeyId?: string;
  correlationId: string;
  body: IngestEventInput;
  executionSource?: 'EVENT' | 'INTERNAL';
}): Promise<IngestEventResultDto> {
  const existing = await findEventIngestByIdempotencyKey({
    organizationId: input.organizationId,
    idempotencyKey: input.body.idempotencyKey,
  });

  if (existing) {
    const execution = await findLatestExecutionForEventIngest(existing.id);
    return {
      eventIngest: existing,
      duplicate: true,
      executionId: execution?.executionId,
      messageId: execution?.messageId ?? undefined,
    };
  }

  let eventIngest;
  try {
    eventIngest = await insertEventIngest({
      organizationId: input.organizationId,
      correlationId: input.correlationId,
      eventKey: input.body.eventKey,
      idempotencyKey: input.body.idempotencyKey,
      recipientPhone: input.body.recipientPhone,
      payload: input.body.payload,
      apiKeyId: input.apiKeyId,
    });
  } catch (error) {
    if (error instanceof ConflictError) {
      const duplicate = await findEventIngestByIdempotencyKey({
        organizationId: input.organizationId,
        idempotencyKey: input.body.idempotencyKey,
      });
      if (duplicate) {
        const execution = await findLatestExecutionForEventIngest(duplicate.id);
        return {
          eventIngest: duplicate,
          duplicate: true,
          executionId: execution?.executionId,
          messageId: execution?.messageId ?? undefined,
        };
      }
    }
    throw error;
  }

  try {
    await enqueueNotificationTrigger({
      eventIngestId: eventIngest.id,
      correlationId: input.correlationId,
      executionSource: input.executionSource,
    });
  } catch (error) {
    if (error instanceof InternalServerError && error.errorCode === 'QUEUE_NOT_CONFIGURED') {
      throw error;
    }
    throw error;
  }

  return {
    eventIngest,
    duplicate: false,
  };
}

export async function markExecutionSentForMessage(messageId: string): Promise<void> {
  await updateNotificationExecutionByMessageId({
    messageId,
    status: 'SENT',
  });
}

export async function markExecutionFailedForMessage(
  messageId: string,
  errorMessage: string,
): Promise<void> {
  await updateNotificationExecutionByMessageId({
    messageId,
    status: 'FAILED',
    errorMessage,
  });
}

export async function listOrganizationEventIngests(
  organizationId: string,
  query: {
    page: number;
    limit: number;
    status?: 'RECEIVED' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'SKIPPED';
    eventKey?: string;
  },
): Promise<{ items: EventIngestDto[]; total: number }> {
  return listEventIngestsByOrganization({
    organizationId,
    page: query.page,
    limit: query.limit,
    status: query.status,
    eventKey: query.eventKey,
  });
}
