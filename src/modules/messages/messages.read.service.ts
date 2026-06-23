import {
  listMessagesByOrganization,
  requireMessageById,
} from './messages.repository';
import type { ListMessagesQuery, MessageDetailDto, MessageSummaryDto } from './messages.schemas';

export async function listOrganizationMessages(
  organizationId: string,
  query: ListMessagesQuery,
): Promise<{ items: MessageSummaryDto[]; total: number; page: number; limit: number }> {
  const result = await listMessagesByOrganization({
    organizationId,
    page: query.page,
    limit: query.limit,
    status: query.status,
    recipientPhone: query.recipientPhone,
    metaTemplateName: query.metaTemplateName,
    idempotencyKey: query.idempotencyKey,
  });

  return {
    ...result,
    page: query.page,
    limit: query.limit,
  };
}

export async function getOrganizationMessage(
  organizationId: string,
  messageId: string,
): Promise<MessageDetailDto> {
  return requireMessageById(organizationId, messageId);
}
