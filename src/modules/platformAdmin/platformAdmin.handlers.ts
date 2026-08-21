import { Request, Response } from 'express';
import { AppResponse } from '../../shared/responses/AppResponse';
import { getValidated } from '../../middleware/validate';
import type {
  CreateOrganizationInput,
  ListOrganizationsQuery,
  PlatformLoginInput,
  UpdateOrganizationInput,
  UpdateWhatsAppAccountNameInput,
} from './platformAdmin.schemas';
import {
  createOrganizationForPlatform,
  deleteOrganizationWhatsAppAccount,
  getOrganizationDetail,
  getOrganizationWhatsAppAccountDetail,
  getPlatformAdminProfile,
  listOrganizations,
  listOrganizationWhatsAppAccounts,
  platformLogin,
  updateOrganizationDetails,
  updateOrganizationWhatsAppAccountName,
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

export async function updateOrganizationHandler(req: Request, res: Response): Promise<void> {
  requirePlatformAuthContext(req);
  const body = getValidated<UpdateOrganizationInput>(req, 'body');
  const organization = await updateOrganizationDetails(req.params.id, body);
  AppResponse.updated(res, 'Organization updated', { organization });
}

export async function listOrganizationWhatsAppAccountsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  requirePlatformAuthContext(req);
  const accounts = await listOrganizationWhatsAppAccounts(req.params.id);
  AppResponse.success(res, 'WhatsApp accounts retrieved', { accounts });
}

export async function getOrganizationWhatsAppAccountHandler(
  req: Request,
  res: Response,
): Promise<void> {
  requirePlatformAuthContext(req);
  const detail = await getOrganizationWhatsAppAccountDetail(req.params.id, req.params.accountId);
  AppResponse.success(res, 'WhatsApp account retrieved', detail);
}

export async function updateOrganizationWhatsAppAccountNameHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { userId } = requirePlatformAuthContext(req);
  const body = getValidated<UpdateWhatsAppAccountNameInput>(req, 'body');
  const account = await updateOrganizationWhatsAppAccountName(
    req.params.id,
    req.params.accountId,
    userId,
    body,
  );
  AppResponse.updated(res, 'WhatsApp account updated', { account });
}

export async function deleteOrganizationWhatsAppAccountHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { userId } = requirePlatformAuthContext(req);
  const result = await deleteOrganizationWhatsAppAccount(
    req.params.id,
    req.params.accountId,
    userId,
  );
  AppResponse.success(res, 'WhatsApp account removed', result);
}
