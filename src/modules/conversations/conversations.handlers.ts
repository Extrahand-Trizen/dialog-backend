import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getValidated } from '../../middleware/validate';
import { requireJwtContext, requireSendContext } from '../messages/messages.handlers';
import type {
  ListConversationsQuery,
  ListConversationThreadQuery,
  SendConversationReplyInput,
} from './conversations.schemas';
import { getConversationThread, listOrganizationConversations } from './conversations.read.service';
import { countUnreadConversations, markConversationRead } from './conversations.repository';
import { sendConversationReply } from './conversations.send.service';

export async function getUnreadConversationsCountHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);
  const unreadCount = await countUnreadConversations(organizationId);
  AppResponse.success(res, 'Unread conversation count retrieved', { unreadCount });
}

export async function listConversationsHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);
  const query = getValidated<ListConversationsQuery>(req, 'query');
  const result = await listOrganizationConversations(organizationId, query);

  AppResponse.paginated(res, 'Conversations retrieved', result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
  });
}

export async function getConversationThreadHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);
  const query = getValidated<ListConversationThreadQuery>(req, 'query');
  const result = await getConversationThread(organizationId, req.params.id, query);

  AppResponse.paginated(res, 'Conversation thread retrieved', result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
    conversation: result.conversation,
  });
}

export async function markConversationReadHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);
  await markConversationRead(organizationId, req.params.id);
  AppResponse.updated(res, 'Conversation marked read', null);
}

export async function sendConversationReplyHandler(req: Request, res: Response): Promise<void> {
  const { organizationId, correlationId } = requireSendContext(req);
  const body = getValidated<SendConversationReplyInput>(req, 'body');

  const result = await sendConversationReply({
    organizationId,
    correlationId,
    conversationId: req.params.id,
    body,
  });

  const statusCode = result.duplicate ? 200 : 202;
  const message = result.duplicate
    ? 'Message already queued for this idempotency key'
    : 'Reply accepted for delivery';

  AppResponse.success(res, message, result, undefined, statusCode);
}