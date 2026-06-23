import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getValidated } from '../../middleware/validate';
import type {
  CreateNotificationRuleInput,
  ListNotificationRulesQuery,
  UpdateNotificationRuleInput,
} from './notificationRules.schemas';
import {
  createOrganizationNotificationRule,
  deleteOrganizationNotificationRule,
  getOrganizationNotificationRule,
  listOrganizationNotificationRules,
  updateOrganizationNotificationRule,
} from './notificationRules.service';

function requireJwtContext(req: Request): { userId: string; organizationId: string } {
  const auth = req.auth;
  if (!auth || auth.type !== 'jwt') {
    throw new Error('JWT context missing after auth middleware');
  }
  return { userId: auth.userId, organizationId: auth.organizationId };
}

export async function listNotificationRulesHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);
  const query = getValidated<ListNotificationRulesQuery>(req, 'query');
  const result = await listOrganizationNotificationRules(organizationId, query);

  AppResponse.paginated(res, 'Notification rules retrieved', result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
  });
}

export async function getNotificationRuleHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);
  const rule = await getOrganizationNotificationRule(organizationId, req.params.id);
  AppResponse.success(res, 'Notification rule retrieved', rule);
}

export async function createNotificationRuleHandler(req: Request, res: Response): Promise<void> {
  const { userId, organizationId } = requireJwtContext(req);
  const body = getValidated<CreateNotificationRuleInput>(req, 'body');
  const rule = await createOrganizationNotificationRule(organizationId, userId, body);
  AppResponse.created(res, 'Notification rule created', rule);
}

export async function updateNotificationRuleHandler(req: Request, res: Response): Promise<void> {
  const { userId, organizationId } = requireJwtContext(req);
  const body = getValidated<UpdateNotificationRuleInput>(req, 'body');
  const rule = await updateOrganizationNotificationRule(
    organizationId,
    req.params.id,
    userId,
    body,
  );
  AppResponse.updated(res, 'Notification rule updated', rule);
}

export async function deleteNotificationRuleHandler(req: Request, res: Response): Promise<void> {
  const { userId, organizationId } = requireJwtContext(req);
  await deleteOrganizationNotificationRule(organizationId, req.params.id, userId);
  AppResponse.deleted(res, 'Notification rule deleted');
}
