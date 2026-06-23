import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getValidated } from '../../middleware/validate';
import {
  getOrganizationOutboundWebhook,
  upsertOrganizationOutboundWebhook,
} from './outboundWebhooks.service';
import type { UpsertOutboundWebhookInput } from './outboundWebhooks.schemas';

function requireJwtContext(req: Request): { organizationId: string; userId: string } {
  const auth = req.auth;
  if (!auth || auth.type !== 'jwt') {
    throw new Error('JWT context missing after auth middleware');
  }
  return { organizationId: auth.organizationId, userId: auth.userId };
}

export async function getOutboundWebhookHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);
  const config = await getOrganizationOutboundWebhook(organizationId);
  AppResponse.success(res, 'Outbound webhook configuration retrieved', config);
}

export async function upsertOutboundWebhookHandler(req: Request, res: Response): Promise<void> {
  const { organizationId, userId } = requireJwtContext(req);
  const body = getValidated<UpsertOutboundWebhookInput>(req, 'body');
  const config = await upsertOrganizationOutboundWebhook({
    organizationId,
    userId,
    body,
  });
  AppResponse.updated(res, 'Outbound webhook configuration saved', config);
}
