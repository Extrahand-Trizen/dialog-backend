import { NotFoundError } from '../../shared/errors/AppError';
import { ingestOrganizationEvent } from '../notifications/notifications.service';
import { findActiveOrganizationById } from './integrations.repository';
import type {
  InternalNotificationTriggerInput,
  InternalNotificationTriggerResultDto,
} from './integrations.schemas';

export async function triggerInternalNotification(input: {
  organizationId: string;
  correlationId: string;
  body: InternalNotificationTriggerInput;
}): Promise<InternalNotificationTriggerResultDto> {
  const organization = await findActiveOrganizationById(input.organizationId);
  if (!organization) {
    throw new NotFoundError('Organization not found', 'ORGANIZATION_NOT_FOUND');
  }

  const result = await ingestOrganizationEvent({
    organizationId: organization.id,
    correlationId: input.correlationId,
    body: input.body,
    executionSource: 'INTERNAL',
  });

  return {
    eventIngestId: result.eventIngest.id,
    correlationId: result.eventIngest.correlationId,
    duplicate: result.duplicate,
    executionId: result.executionId,
    messageId: result.messageId,
  };
}
