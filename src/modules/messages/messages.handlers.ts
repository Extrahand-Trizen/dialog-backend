import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getValidated } from '../../middleware/validate';
import type { ListMessagesQuery, SendTemplateMessageInput } from './messages.schemas';
import { getOrganizationMessage, listOrganizationMessages } from './messages.read.service';
import { sendOrganizationTemplateMessage } from './messages.send.service';

function requireJwtContext(req: Request): { organizationId: string } {
  const auth = req.auth;
  if (!auth || auth.type !== 'jwt') {
    throw new Error('JWT context missing after auth middleware');
  }
  return { organizationId: auth.organizationId };
}

export async function listMessagesHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);
  const query = getValidated<ListMessagesQuery>(req, 'query');
  const result = await listOrganizationMessages(organizationId, query);

  AppResponse.paginated(res, 'Messages retrieved', result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
  });
}

export async function getMessageHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);
  const message = await getOrganizationMessage(organizationId, req.params.id);
  AppResponse.success(res, 'Message retrieved', message);
}

function requireSendContext(req: Request): {
  organizationId: string;
  correlationId: string;
} {
  const auth = req.auth;
  if (!auth) {
    throw new Error('Auth context missing after auth middleware');
  }

  if (auth.type === 'apiKey') {
    return {
      organizationId: auth.organizationId,
      correlationId: req.correlationId ?? auth.apiKeyId,
    };
  }

  return {
    organizationId: auth.organizationId,
    correlationId: req.correlationId ?? auth.userId,
  };
}

export async function sendTemplateMessageHandler(req: Request, res: Response): Promise<void> {
  const { organizationId, correlationId } = requireSendContext(req);
  const body = getValidated<SendTemplateMessageInput>(req, 'body');

  const result = await sendOrganizationTemplateMessage({
    organizationId,
    correlationId,
    body,
  });

  const statusCode = result.duplicate ? 200 : 202;
  const message = result.duplicate
    ? 'Message already queued for this idempotency key'
    : 'Message accepted for delivery';

  AppResponse.success(res, message, result, undefined, statusCode);
}
