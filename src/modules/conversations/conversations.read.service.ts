import type { ConversationSummaryDto, ConversationThreadMessageDto } from './conversations.schemas';
import {
  listConversationsByOrganization,
  listThreadMessages,
  requireConversationForOrg,
} from './conversations.repository';

export async function listOrganizationConversations(
  organizationId: string,
  query: { page: number; limit: number; unreadOnly?: boolean },
): Promise<{ items: ConversationSummaryDto[]; total: number; page: number; limit: number }> {
  const result = await listConversationsByOrganization({
    organizationId,
    page: query.page,
    limit: query.limit,
    unreadOnly: query.unreadOnly,
  });

  return { ...result, page: query.page, limit: query.limit };
}

export async function getConversationThread(
  organizationId: string,
  conversationId: string,
  query: { page: number; limit: number },
): Promise<{ items: ConversationThreadMessageDto[]; total: number; page: number; limit: number }> {
  const conversation = await requireConversationForOrg(organizationId, conversationId);

  const result = await listThreadMessages({
    organizationId,
    phoneNumberId: conversation.phoneNumberId,
    contactPhone: conversation.contactPhone,
    page: query.page,
    limit: query.limit,
  });

  return { ...result, page: query.page, limit: query.limit };
}
