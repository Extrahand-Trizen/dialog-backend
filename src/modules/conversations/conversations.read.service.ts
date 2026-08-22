import type { ConversationSummaryDto, ConversationThreadMessageDto } from './conversations.schemas';
import {
  findLatestInboundForContact,
  listConversationsByOrganization,
  listThreadMessages,
  requireConversationForOrg,
  toConversationSummaryDto,
} from './conversations.repository';

export async function listOrganizationConversations(
  organizationId: string,
  query: { page: number; limit: number; unreadOnly?: boolean; search?: string },
): Promise<{ items: ConversationSummaryDto[]; total: number; page: number; limit: number }> {
  const result = await listConversationsByOrganization({
    organizationId,
    page: query.page,
    limit: query.limit,
    unreadOnly: query.unreadOnly,
    search: query.search,
  });

  return { ...result, page: query.page, limit: query.limit };
}

export async function getConversationThread(
  organizationId: string,
  conversationId: string,
  query: { page: number; limit: number },
): Promise<{
  conversation: ConversationSummaryDto;
  items: ConversationThreadMessageDto[];
  total: number;
  page: number;
  limit: number;
}> {
  const conversation = await requireConversationForOrg(organizationId, conversationId);
  const [result, inbound] = await Promise.all([
    listThreadMessages({
      organizationId,
      phoneNumberId: conversation.phoneNumberId,
      contactPhone: conversation.contactPhone,
      page: query.page,
      limit: query.limit,
    }),
    findLatestInboundForContact({
      organizationId,
      phoneNumberId: conversation.phoneNumberId,
      contactPhone: conversation.contactPhone,
    }),
  ]);

  return {
    conversation: toConversationSummaryDto(conversation, inbound?.createdAt ?? conversation.lastInboundAt),
    ...result,
    page: query.page,
    limit: query.limit,
  };
}
