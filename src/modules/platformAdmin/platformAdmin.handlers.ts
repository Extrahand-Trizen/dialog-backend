import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getValidated } from '../../middleware/validate';
import type {
  CreateOrganizationInput,
  ListOrganizationsQuery,
  PlatformLoginInput,
  UpdateOrganizationStatusInput,
} from './platformAdmin.schemas';
import {
  createOrganizationForPlatform,
  getOrganizationDetail,
  getPlatformAdminProfile,
  listOrganizations,
  platformLogin,
  updateOrganizationStatus,
} from './platformAdmin.service';

function requirePlatformAuthContext(req: Request): { userId: string } {
  const auth = req.auth;
  if (!auth || auth.type !== 'platformAdmin') {
    throw new Error('Platform admin context missing after auth middleware');
  }
  return { userId: auth.userId };
}

export async function platformLoginHandler(req: Request, res: Response): Promise<void> {
  const body = getValidated<PlatformLoginInput>(req, 'body');
  const result = await platformLogin(body);
  AppResponse.success(res, 'Login successful', result);
}

export async function platformMeHandler(req: Request, res: Response): Promise<void> {
  const { userId } = requirePlatformAuthContext(req);
  const admin = await getPlatformAdminProfile(userId);
  AppResponse.success(res, 'Platform admin profile', { admin });
}

export async function createOrganizationHandler(req: Request, res: Response): Promise<void> {
  const { userId } = requirePlatformAuthContext(req);
  const body = getValidated<CreateOrganizationInput>(req, 'body');
  const result = await createOrganizationForPlatform(userId, body);
  AppResponse.created(res, 'Organization created', result);
}

export async function listOrganizationsHandler(req: Request, res: Response): Promise<void> {
  requirePlatformAuthContext(req);
  const query = getValidated<ListOrganizationsQuery>(req, 'query');
  const result = await listOrganizations(query);

  AppResponse.paginated(res, 'Organizations retrieved', result.items, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
  });
}

export async function getOrganizationHandler(req: Request, res: Response): Promise<void> {
  requirePlatformAuthContext(req);
  const organization = await getOrganizationDetail(req.params.id);
  AppResponse.success(res, 'Organization retrieved', { organization });
}

export async function updateOrganizationStatusHandler(req: Request, res: Response): Promise<void> {
  requirePlatformAuthContext(req);
  const body = getValidated<UpdateOrganizationStatusInput>(req, 'body');
  const organization = await updateOrganizationStatus(req.params.id, body.isActive);
  AppResponse.updated(res, 'Organization updated', { organization });
}
