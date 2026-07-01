import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getValidated } from '../../middleware/validate';
import type { ListTemplatesQuery, SyncTemplatesInput } from './templates.schemas';
import type {
  CreateTemplateInput,
  UpdateTemplateVariableNamesInput,
  UpdateTemplateInput,
} from './templates.schemas';
import {
  createOrganizationTemplateForUser,
  enqueueOrganizationTemplateSync,
  getOrganizationTemplate,
  listOrganizationTemplates,
  syncOrganizationTemplates,
  updateOrganizationTemplateForUser,
  updateOrganizationTemplateVariableNames,
} from './templates.service';

function requireJwtContext(req: Request): {
  userId: string;
  organizationId: string;
  correlationId?: string;
} {
  const auth = req.auth;
  if (!auth || auth.type !== 'jwt') {
    throw new Error('JWT context missing after auth middleware');
  }
  return {
    userId: auth.userId,
    organizationId: auth.organizationId,
    correlationId: req.correlationId,
  };
}

export async function listTemplatesHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);
  const query = getValidated<ListTemplatesQuery>(req, 'query');
  const result = await listOrganizationTemplates(organizationId, query);

  AppResponse.paginated(res, 'Templates retrieved', result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
  });
}

export async function getTemplateHandler(req: Request, res: Response): Promise<void> {
  const { organizationId } = requireJwtContext(req);
  const template = await getOrganizationTemplate(organizationId, req.params.id);
  AppResponse.success(res, 'Template retrieved', template);
}

export async function syncTemplatesHandler(req: Request, res: Response): Promise<void> {
  const { userId, organizationId, correlationId } = requireJwtContext(req);
  const body = getValidated<SyncTemplatesInput>(req, 'body');
  const result = await syncOrganizationTemplates(
    organizationId,
    userId,
    body.whatsAppAccountId,
    correlationId,
  );
  AppResponse.success(res, 'Templates imported from Meta', result);
}

export async function createTemplateHandler(req: Request, res: Response): Promise<void> {
  const { userId, organizationId } = requireJwtContext(req);
  const body = getValidated<CreateTemplateInput>(req, 'body');
  const template = await createOrganizationTemplateForUser(organizationId, userId, body);
  AppResponse.success(res, 'Template submitted to Meta for approval', template, undefined, 201);
}

export async function updateTemplateHandler(req: Request, res: Response): Promise<void> {
  const { userId, organizationId } = requireJwtContext(req);
  const body = getValidated<UpdateTemplateInput>(req, 'body');
  const template = await updateOrganizationTemplateForUser(
    organizationId,
    userId,
    req.params.id,
    body,
  );
  AppResponse.success(res, 'Template submitted to Meta for approval', template);
}

export async function updateTemplateVariableNamesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { userId, organizationId } = requireJwtContext(req);
  const body = getValidated<UpdateTemplateVariableNamesInput>(req, 'body');
  const template = await updateOrganizationTemplateVariableNames(
    organizationId,
    userId,
    req.params.id,
    body,
  );
  AppResponse.success(res, 'Template variable names updated', template);
}
